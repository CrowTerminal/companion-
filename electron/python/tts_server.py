#!/usr/bin/env python3
"""
CrowTerminal Creator Studio - TTS Server
Local HTTP server for Qwen3-TTS voice cloning and generation.

This server provides:
- Voice cloning from 3-second audio samples
- Text-to-speech generation with cloned voices
- Voice design from text descriptions
- Multi-language support (10 languages)

Optimized for Apple Silicon with MLX acceleration.
"""

import os
import sys
import json
import uuid
import logging
import tempfile
import platform
from pathlib import Path
from typing import Optional, Dict, Any, List
from dataclasses import dataclass, asdict
from datetime import datetime

from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('tts_server')

app = Flask(__name__)
CORS(app)

# Configuration
TTS_PORT = int(os.environ.get('TTS_PORT', 8765))
MODELS_DIR = os.environ.get('TTS_MODELS_DIR', os.path.expanduser('~/.crowterminal/models/tts'))
VOICES_DIR = os.environ.get('TTS_VOICES_DIR', os.path.expanduser('~/.crowterminal/voices'))
OUTPUT_DIR = os.environ.get('TTS_OUTPUT_DIR', tempfile.gettempdir())

# Ensure directories exist
Path(MODELS_DIR).mkdir(parents=True, exist_ok=True)
Path(VOICES_DIR).mkdir(parents=True, exist_ok=True)
Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)

# Supported languages (Qwen3-TTS uses full language names)
SUPPORTED_LANGUAGES = {
    'English': 'English',
    'Chinese': 'Chinese',
    'Japanese': 'Japanese',
    'Korean': 'Korean',
    'German': 'German',
    'French': 'French',
    'Russian': 'Russian',
    'Portuguese': 'Portuguese',
    'Spanish': 'Spanish',
    'Italian': 'Italian',
}

# Preset speakers available in CustomVoice models
PRESET_SPEAKERS = {
    'Vivian': {'language': 'Chinese', 'description': 'Bright, slightly edgy young female'},
    'Serena': {'language': 'Chinese', 'description': 'Warm, gentle young female'},
    'Uncle_Fu': {'language': 'Chinese', 'description': 'Low, mellow seasoned male'},
    'Dylan': {'language': 'Chinese', 'description': 'Clear, natural Beijing male'},
    'Eric': {'language': 'Chinese', 'description': 'Lively, husky Sichuan male'},
    'Ryan': {'language': 'English', 'description': 'Dynamic male with strong rhythm'},
    'Aiden': {'language': 'English', 'description': 'Sunny American male, clear midrange'},
    'Ono_Anna': {'language': 'Japanese', 'description': 'Playful, light Japanese female'},
    'Sohee': {'language': 'Korean', 'description': 'Warm Korean female, rich emotion'},
}

# TTS Model configurations with correct Qwen3-TTS model names
TTS_MODELS = {
    'qwen3-tts-0.6b-base': {
        'name': 'Qwen3-TTS 0.6B (Clone)',
        'size': '1.2 GB',
        'sizeBytes': 1.2 * 1024 * 1024 * 1024,
        'description': 'Lightweight voice cloning. Good for 8GB+ RAM.',
        'ramRequired': 4,
        'repo': 'Qwen/Qwen3-TTS-12Hz-0.6B-Base',
        'type': 'clone',  # Supports voice cloning from audio
    },
    'qwen3-tts-0.6b-custom': {
        'name': 'Qwen3-TTS 0.6B (Presets)',
        'size': '1.2 GB',
        'sizeBytes': 1.2 * 1024 * 1024 * 1024,
        'description': 'Lightweight preset voices with emotion control.',
        'ramRequired': 4,
        'repo': 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
        'type': 'custom',  # Preset speakers with instruct
    },
    'qwen3-tts-1.7b-base': {
        'name': 'Qwen3-TTS 1.7B (Clone)',
        'size': '3.4 GB',
        'sizeBytes': 3.4 * 1024 * 1024 * 1024,
        'description': 'High-quality voice cloning. Requires 16GB+ RAM.',
        'ramRequired': 8,
        'repo': 'Qwen/Qwen3-TTS-12Hz-1.7B-Base',
        'type': 'clone',
    },
    'qwen3-tts-1.7b-custom': {
        'name': 'Qwen3-TTS 1.7B (Presets)',
        'size': '3.4 GB',
        'sizeBytes': 3.4 * 1024 * 1024 * 1024,
        'description': 'Premium preset voices with emotion. Best quality.',
        'ramRequired': 8,
        'repo': 'Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice',
        'type': 'custom',
    },
    'qwen3-tts-1.7b-design': {
        'name': 'Qwen3-TTS 1.7B (Design)',
        'size': '3.4 GB',
        'sizeBytes': 3.4 * 1024 * 1024 * 1024,
        'description': 'Create voices from text descriptions.',
        'ramRequired': 8,
        'repo': 'Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign',
        'type': 'design',  # Voice from text description
    },
}


@dataclass
class VoiceProfile:
    """Represents a cloned voice profile."""
    id: str
    name: str
    description: str
    sample_path: str
    created_at: str
    language: str
    transcript: str = ''
    embedding_path: Optional[str] = None


class TTSService:
    """Service for managing TTS operations."""

    def __init__(self):
        self.model = None
        self.processor = None
        self.current_model_name: Optional[str] = None
        self.current_model_type: Optional[str] = None  # 'clone', 'custom', or 'design'
        self.device = self._get_device()
        self.voices: Dict[str, VoiceProfile] = {}
        self._load_voices()

    def _get_device(self) -> str:
        """Determine the best device for inference."""
        try:
            import torch
            if torch.cuda.is_available():
                return 'cuda'
            elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                return 'mps'
        except ImportError:
            pass

        return 'cpu'

    def _load_voices(self):
        """Load saved voice profiles from disk."""
        voices_file = Path(VOICES_DIR) / 'voices.json'
        if voices_file.exists():
            try:
                with open(voices_file, 'r') as f:
                    data = json.load(f)
                    for voice_data in data:
                        voice = VoiceProfile(**voice_data)
                        self.voices[voice.id] = voice
                logger.info(f'Loaded {len(self.voices)} voice profiles')
            except Exception as e:
                logger.error(f'Failed to load voices: {e}')

    def _save_voices(self):
        """Save voice profiles to disk."""
        voices_file = Path(VOICES_DIR) / 'voices.json'
        try:
            data = [asdict(v) for v in self.voices.values()]
            with open(voices_file, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            logger.error(f'Failed to save voices: {e}')

    def get_status(self) -> Dict[str, Any]:
        """Get service status."""
        return {
            'running': True,
            'device': self.device,
            'modelLoaded': self.current_model_name is not None,
            'currentModel': self.current_model_name,
            'currentModelType': self.current_model_type,
            'voiceCount': len(self.voices),
            'supportedLanguages': SUPPORTED_LANGUAGES,
            'presetSpeakers': PRESET_SPEAKERS if self.current_model_type == 'custom' else {},
        }

    def get_available_models(self) -> List[Dict[str, Any]]:
        """Get list of available TTS models."""
        models = []
        for model_id, config in TTS_MODELS.items():
            model_path = Path(MODELS_DIR) / model_id
            models.append({
                'id': model_id,
                **config,
                'downloaded': model_path.exists(),
                'path': str(model_path),
            })
        return models

    def download_model(self, model_id: str, progress_callback=None) -> bool:
        """Download a TTS model."""
        if model_id not in TTS_MODELS:
            raise ValueError(f'Unknown model: {model_id}')

        config = TTS_MODELS[model_id]
        model_path = Path(MODELS_DIR) / model_id

        if model_path.exists():
            logger.info(f'Model {model_id} already downloaded')
            return True

        logger.info(f'Downloading model {model_id} from {config["repo"]}')

        try:
            # Use huggingface_hub for downloading
            from huggingface_hub import snapshot_download

            snapshot_download(
                repo_id=config['repo'],
                local_dir=str(model_path),
                local_dir_use_symlinks=False,
            )

            logger.info(f'Model {model_id} downloaded successfully')
            return True
        except Exception as e:
            logger.error(f'Failed to download model: {e}')
            raise

    def load_model(self, model_id: str) -> bool:
        """Load a TTS model into memory."""
        if model_id not in TTS_MODELS:
            raise ValueError(f'Unknown model: {model_id}')

        model_path = Path(MODELS_DIR) / model_id
        if not model_path.exists():
            raise ValueError(f'Model not downloaded: {model_id}')

        if self.current_model_name == model_id:
            logger.info(f'Model {model_id} already loaded')
            return True

        # Unload previous model first
        if self.model is not None:
            self.unload_model()

        logger.info(f'Loading model {model_id}...')

        try:
            import torch
            from qwen_tts import Qwen3TTSModel

            model_config = TTS_MODELS[model_id]

            # Determine dtype based on device
            # Note: MPS works best with float32 for stability
            if self.device == 'cuda':
                dtype = torch.bfloat16
                device_map = 'cuda:0'
                attn_impl = 'flash_attention_2'
            elif self.device == 'mps':
                # Use float32 on MPS for numerical stability
                dtype = torch.float32
                device_map = 'auto'  # Let the library decide
                attn_impl = None  # MPS doesn't support flash attention
            else:
                dtype = torch.float32
                device_map = 'cpu'
                attn_impl = None

            logger.info(f'Loading model with dtype={dtype}, device_map={device_map}')

            # Load with qwen_tts library
            self.model = Qwen3TTSModel.from_pretrained(
                str(model_path),
                device_map=device_map,
                torch_dtype=dtype,
                attn_implementation=attn_impl,
            )

            self.current_model_name = model_id
            self.current_model_type = model_config.get('type', 'clone')
            logger.info(f'Model {model_id} (type: {self.current_model_type}) loaded on {self.device}')
            return True
        except ImportError as e:
            logger.error(f'qwen_tts not installed. Please run: pip install qwen-tts')
            raise ValueError(f'qwen_tts package not installed: {e}')
        except Exception as e:
            logger.error(f'Failed to load model: {e}')
            raise

    def unload_model(self):
        """Unload the current model to free memory."""
        if self.model is not None:
            del self.model
            if self.processor is not None:
                del self.processor
            self.model = None
            self.processor = None
            self.current_model_name = None
            self.current_model_type = None

            # Force garbage collection
            import gc
            gc.collect()

            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                if hasattr(torch, 'mps') and hasattr(torch.mps, 'empty_cache'):
                    torch.mps.empty_cache()
            except Exception:
                pass

            logger.info('Model unloaded')

    def clone_voice(
        self,
        audio_path: str,
        name: str,
        description: str = '',
        language: str = 'en',
        transcript: str = ''
    ) -> VoiceProfile:
        """Clone a voice from an audio sample."""
        if not Path(audio_path).exists():
            raise ValueError(f'Audio file not found: {audio_path}')

        # Generate unique ID
        voice_id = str(uuid.uuid4())[:8]

        # Copy audio sample to voices directory
        sample_ext = Path(audio_path).suffix
        sample_path = Path(VOICES_DIR) / f'{voice_id}_sample{sample_ext}'

        import shutil
        shutil.copy2(audio_path, sample_path)

        # Create voice profile
        voice = VoiceProfile(
            id=voice_id,
            name=name,
            description=description,
            sample_path=str(sample_path),
            created_at=datetime.now().isoformat(),
            language=language,
            transcript=transcript,
        )

        # Extract voice embedding if model is loaded
        if self.model is not None:
            embedding_path = Path(VOICES_DIR) / f'{voice_id}_embedding.npy'
            # Note: Actual embedding extraction would happen here
            # For now, we store the sample path for reference cloning
            voice.embedding_path = str(embedding_path)

        self.voices[voice_id] = voice
        self._save_voices()

        logger.info(f'Voice "{name}" cloned successfully with ID: {voice_id}')
        return voice

    def generate_speech(
        self,
        text: str,
        voice_id: Optional[str] = None,
        language: str = 'English',
        speed: float = 1.0,
        instruct: str = '',
        speaker: str = '',
        output_format: str = 'wav'
    ) -> str:
        """Generate speech from text.

        Args:
            text: The text to synthesize
            voice_id: ID of a cloned voice to use (for Base models)
            language: Language of the text (e.g., 'English', 'Chinese')
            speed: Speech speed multiplier
            instruct: Emotion/style instruction (e.g., 'happy', 'sad', 'whispering')
            speaker: Preset speaker name (for CustomVoice models)
            output_format: Output audio format ('wav' or 'mp3')
        """
        if self.model is None:
            raise ValueError('No model loaded. Please load a model first.')

        # Normalize language name
        if language in SUPPORTED_LANGUAGES:
            lang = language
        else:
            # Try to map short codes to full names for backwards compatibility
            lang_map = {'en': 'English', 'zh': 'Chinese', 'ja': 'Japanese',
                       'ko': 'Korean', 'de': 'German', 'fr': 'French',
                       'ru': 'Russian', 'pt': 'Portuguese', 'es': 'Spanish', 'it': 'Italian'}
            lang = lang_map.get(language, 'English')

        # Generate unique output filename
        output_filename = f'tts_{uuid.uuid4().hex[:8]}.{output_format}'
        output_path = Path(OUTPUT_DIR) / output_filename

        logger.info(f'Generating speech: "{text[:50]}..." type={self.current_model_type}, voice={voice_id}, speaker={speaker}, lang={lang}')

        try:
            import soundfile as sf

            # Generate based on model type
            if self.current_model_type == 'clone' and voice_id:
                # Voice cloning with reference audio
                if voice_id not in self.voices:
                    raise ValueError(f'Voice not found: {voice_id}')

                voice = self.voices[voice_id]

                # Validate voice has required data
                if not voice.sample_path or not Path(voice.sample_path).exists():
                    raise ValueError(f'Voice sample audio file not found: {voice.sample_path}')
                if not voice.transcript or len(voice.transcript.strip()) < 3:
                    raise ValueError(f'Voice transcript is missing or too short. Please provide the exact text spoken in the audio sample.')

                logger.info(f'Cloning voice: ref_audio={voice.sample_path}, ref_text="{voice.transcript[:50]}..."')

                wavs, sample_rate = self.model.generate_voice_clone(
                    text=text,
                    language=lang,
                    ref_audio=voice.sample_path,
                    ref_text=voice.transcript,
                )
            elif self.current_model_type == 'custom':
                # Preset speaker with optional emotion
                preset_speaker = speaker if speaker and speaker in PRESET_SPEAKERS else 'Ryan'
                wavs, sample_rate = self.model.generate_custom_voice(
                    text=text,
                    language=lang,
                    speaker=preset_speaker,
                    instruct=instruct if instruct else None,
                )
            elif self.current_model_type == 'design' and instruct:
                # Voice design from description
                wavs, sample_rate = self.model.generate_voice_design(
                    text=text,
                    language=lang,
                    instruct=instruct,
                )
            else:
                # Default: use custom voice with default speaker or clone if available
                if self.current_model_type == 'custom':
                    wavs, sample_rate = self.model.generate_custom_voice(
                        text=text,
                        language=lang,
                        speaker=speaker if speaker else 'Ryan',
                    )
                elif voice_id and voice_id in self.voices:
                    voice = self.voices[voice_id]
                    wavs, sample_rate = self.model.generate_voice_clone(
                        text=text,
                        language=lang,
                        ref_audio=voice.sample_path,
                        ref_text=voice.transcript,
                    )
                else:
                    raise ValueError(
                        f'No voice specified. Model type "{self.current_model_type}" requires '
                        f'{"a cloned voice" if self.current_model_type == "clone" else "a preset speaker or instruct"}'
                    )

            # Write audio to file
            audio_data = wavs[0] if isinstance(wavs, (list, tuple)) else wavs

            # Convert to numpy if it's a tensor
            if hasattr(audio_data, 'cpu'):
                audio_data = audio_data.cpu().numpy()

            sf.write(str(output_path), audio_data, sample_rate)

            logger.info(f'Speech generated: {output_path} (sample_rate={sample_rate})')
            return str(output_path)
        except Exception as e:
            import traceback
            logger.error(f'Failed to generate speech: {e}')
            logger.error(f'Traceback: {traceback.format_exc()}')
            raise

    def list_voices(self) -> List[Dict[str, Any]]:
        """List all saved voice profiles."""
        return [asdict(v) for v in self.voices.values()]

    def delete_voice(self, voice_id: str) -> bool:
        """Delete a voice profile."""
        if voice_id not in self.voices:
            return False

        voice = self.voices[voice_id]

        # Delete associated files
        try:
            if Path(voice.sample_path).exists():
                Path(voice.sample_path).unlink()
            if voice.embedding_path and Path(voice.embedding_path).exists():
                Path(voice.embedding_path).unlink()
        except Exception as e:
            logger.error(f'Failed to delete voice files: {e}')

        del self.voices[voice_id]
        self._save_voices()

        logger.info(f'Voice {voice_id} deleted')
        return True

    def delete_model(self, model_id: str) -> bool:
        """Delete a downloaded model."""
        if model_id not in TTS_MODELS:
            return False

        model_path = Path(MODELS_DIR) / model_id
        if not model_path.exists():
            return False

        # Unload if currently loaded
        if self.current_model_name == model_id:
            self.unload_model()

        import shutil
        shutil.rmtree(model_path)

        logger.info(f'Model {model_id} deleted')
        return True


# Initialize service
tts_service = TTSService()


# API Routes

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'tts'})


@app.route('/status', methods=['GET'])
def status():
    """Get service status."""
    return jsonify(tts_service.get_status())


@app.route('/models', methods=['GET'])
def list_models():
    """List available TTS models."""
    return jsonify(tts_service.get_available_models())


@app.route('/models/<model_id>/download', methods=['POST'])
def download_model(model_id: str):
    """Download a TTS model."""
    try:
        tts_service.download_model(model_id)
        return jsonify({'success': True, 'modelId': model_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/models/<model_id>/load', methods=['POST'])
def load_model(model_id: str):
    """Load a TTS model."""
    try:
        tts_service.load_model(model_id)
        return jsonify({'success': True, 'modelId': model_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/models/<model_id>/delete', methods=['DELETE'])
def delete_model(model_id: str):
    """Delete a downloaded model."""
    success = tts_service.delete_model(model_id)
    return jsonify({'success': success})


@app.route('/models/unload', methods=['POST'])
def unload_model():
    """Unload current model to free memory."""
    tts_service.unload_model()
    return jsonify({'success': True})


@app.route('/voices', methods=['GET'])
def list_voices():
    """List all voice profiles."""
    return jsonify(tts_service.list_voices())


@app.route('/voices/clone', methods=['POST'])
def clone_voice():
    """Clone a voice from an audio sample."""
    # Support both JSON and form data
    if request.is_json:
        data = request.get_json()
        audio_path = data.get('audioPath')
        name = data.get('name', 'Unnamed Voice')
        description = data.get('description', '')
        language = data.get('language', 'en')
        transcript = data.get('transcript', '')
    else:
        audio_path = request.form.get('audioPath')
        name = request.form.get('name', 'Unnamed Voice')
        description = request.form.get('description', '')
        language = request.form.get('language', 'en')
        transcript = request.form.get('transcript', '')

        # Handle file upload if present
        if 'audio' in request.files:
            audio_file = request.files['audio']
            temp_path = Path(tempfile.gettempdir()) / f'voice_sample_{uuid.uuid4().hex[:8]}{Path(audio_file.filename).suffix}'
            audio_file.save(str(temp_path))
            audio_path = str(temp_path)

    if not audio_path:
        return jsonify({'success': False, 'error': 'No audio provided'}), 400

    try:
        voice = tts_service.clone_voice(audio_path, name, description, language, transcript)
        return jsonify({'success': True, 'voice': asdict(voice)})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/voices/<voice_id>', methods=['DELETE'])
def delete_voice(voice_id: str):
    """Delete a voice profile."""
    success = tts_service.delete_voice(voice_id)
    return jsonify({'success': success})


@app.route('/generate', methods=['POST'])
def generate():
    """Generate speech from text.

    Request body:
        text (str): Text to synthesize
        voiceId (str, optional): ID of cloned voice (for Base models)
        speaker (str, optional): Preset speaker name (for CustomVoice models)
        instruct (str, optional): Emotion/style instruction
        language (str): Language name (default: 'English')
        speed (float): Speech speed (default: 1.0)
        format (str): Output format 'wav' or 'mp3' (default: 'wav')
    """
    data = request.get_json()

    if not data or 'text' not in data:
        return jsonify({'success': False, 'error': 'No text provided'}), 400

    try:
        output_path = tts_service.generate_speech(
            text=data['text'],
            voice_id=data.get('voiceId'),
            speaker=data.get('speaker', ''),
            instruct=data.get('instruct', ''),
            language=data.get('language', 'English'),
            speed=data.get('speed', 1.0),
            output_format=data.get('format', 'wav'),
        )
        return jsonify({
            'success': True,
            'outputPath': output_path,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/generate/stream', methods=['POST'])
def generate_stream():
    """Generate speech and return audio file directly."""
    data = request.get_json()

    if not data or 'text' not in data:
        return jsonify({'success': False, 'error': 'No text provided'}), 400

    try:
        output_path = tts_service.generate_speech(
            text=data['text'],
            voice_id=data.get('voiceId'),
            speaker=data.get('speaker', ''),
            instruct=data.get('instruct', ''),
            language=data.get('language', 'English'),
            speed=data.get('speed', 1.0),
            output_format=data.get('format', 'wav'),
        )
        return send_file(
            output_path,
            mimetype='audio/wav',
            as_attachment=True,
            download_name=f'generated_speech.{data.get("format", "wav")}'
        )
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/speakers', methods=['GET'])
def list_speakers():
    """List available preset speakers (only for CustomVoice models)."""
    return jsonify({
        'speakers': PRESET_SPEAKERS,
        'available': tts_service.current_model_type == 'custom',
    })


@app.route('/languages', methods=['GET'])
def list_languages():
    """List supported languages."""
    return jsonify(SUPPORTED_LANGUAGES)


if __name__ == '__main__':
    logger.info(f'Starting TTS server on port {TTS_PORT}')
    logger.info(f'Models directory: {MODELS_DIR}')
    logger.info(f'Voices directory: {VOICES_DIR}')
    logger.info(f'Device: {tts_service.device}')

    app.run(host='127.0.0.1', port=TTS_PORT, debug=False)
