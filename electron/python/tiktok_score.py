#!/usr/bin/env python3
"""
CrowTerminal Creator Studio - TikTok Score Analyzer
Local video analysis to predict TikTok algorithm performance.

Analysis Categories:
- Technical Quality (resolution, aspect ratio, lighting, blur)
- Hook Analysis (first 3 seconds engagement)
- Audio Quality (levels, clarity, noise)
- Content Analysis (captions, faces, pacing, watermarks)

All processing runs locally - no cloud dependencies.
"""

import os
import sys
import json
import tempfile
import subprocess
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
from dataclasses import dataclass, asdict
import math

import cv2
import numpy as np

# Optional imports with fallbacks
try:
    import librosa
    HAS_LIBROSA = True
except ImportError:
    HAS_LIBROSA = False
    logging.warning('librosa not installed - audio analysis will be limited')

try:
    from scenedetect import detect, ContentDetector
    HAS_SCENEDETECT = True
except ImportError:
    HAS_SCENEDETECT = False
    logging.warning('scenedetect not installed - pacing analysis will be limited')

from flask import Flask, request, jsonify
from flask_cors import CORS

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('tiktok_score')

app = Flask(__name__)
CORS(app)

# Configuration
ANALYZER_PORT = int(os.environ.get('ANALYZER_PORT', 8766))
TEMP_DIR = tempfile.gettempdir()

# TikTok optimal parameters
TIKTOK_OPTIMAL = {
    'resolution': (1080, 1920),  # 1080x1920 (9:16)
    'aspect_ratio': 9 / 16,  # 0.5625
    'fps': 30,
    'max_duration': 180,  # 3 minutes
    'optimal_duration': (15, 60),  # 15-60 seconds is optimal
    'scene_changes_per_min': (3, 5),  # Optimal pacing
    'audio_level_db': -14,  # LUFS target
}


@dataclass
class TechnicalScore:
    """Technical quality analysis."""
    resolution: int  # 0-100
    aspect_ratio: int  # 0-100
    lighting: int  # 0-100
    blur: int  # 0-100
    fps: int  # 0-100
    details: Dict[str, Any] = None

    @property
    def overall(self) -> int:
        return int((self.resolution + self.aspect_ratio + self.lighting + self.blur + self.fps) / 5)


@dataclass
class HookScore:
    """First 3 seconds engagement analysis."""
    first_3_seconds: int  # 0-100
    movement: int  # 0-100
    face_detected: bool
    scene_changes: int
    details: Dict[str, Any] = None

    @property
    def overall(self) -> int:
        face_bonus = 10 if self.face_detected else 0
        return min(100, int((self.first_3_seconds + self.movement) / 2) + face_bonus)


@dataclass
class AudioScore:
    """Audio quality analysis."""
    levels: int  # 0-100
    clarity: int  # 0-100
    has_audio: bool
    is_silent: bool
    details: Dict[str, Any] = None

    @property
    def overall(self) -> int:
        if not self.has_audio or self.is_silent:
            return 30  # Penalty for no audio
        return int((self.levels + self.clarity) / 2)


@dataclass
class ContentScore:
    """Content analysis."""
    has_captions: bool
    has_faces: bool
    pacing: int  # 0-100
    no_watermarks: bool
    scene_count: int
    duration_optimal: bool
    details: Dict[str, Any] = None

    @property
    def overall(self) -> int:
        score = self.pacing
        if self.has_captions:
            score += 15
        if self.has_faces:
            score += 10
        if not self.no_watermarks:
            score -= 30
        if self.duration_optimal:
            score += 5
        return max(0, min(100, score))


@dataclass
class TikTokScoreResult:
    """Complete TikTok score analysis result."""
    overall_score: int
    technical: TechnicalScore
    hook: HookScore
    audio: AudioScore
    content: ContentScore
    recommendations: List[str]
    video_info: Dict[str, Any]


class VideoAnalyzer:
    """Analyzes videos for TikTok algorithm optimization."""

    def __init__(self):
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )

    def analyze(self, video_path: str, progress_callback=None) -> TikTokScoreResult:
        """Perform complete video analysis."""
        if not Path(video_path).exists():
            raise ValueError(f'Video file not found: {video_path}')

        logger.info(f'Analyzing video: {video_path}')

        # Get video info
        video_info = self._get_video_info(video_path)
        if progress_callback:
            progress_callback(10)

        # Analyze technical quality
        technical = self._analyze_technical(video_path, video_info)
        if progress_callback:
            progress_callback(30)

        # Analyze hook (first 3 seconds)
        hook = self._analyze_hook(video_path, video_info)
        if progress_callback:
            progress_callback(50)

        # Analyze audio
        audio = self._analyze_audio(video_path)
        if progress_callback:
            progress_callback(70)

        # Analyze content
        content = self._analyze_content(video_path, video_info)
        if progress_callback:
            progress_callback(90)

        # Calculate overall score
        overall_score = self._calculate_overall_score(technical, hook, audio, content)

        # Generate recommendations
        recommendations = self._generate_recommendations(technical, hook, audio, content, video_info)

        if progress_callback:
            progress_callback(100)

        return TikTokScoreResult(
            overall_score=overall_score,
            technical=technical,
            hook=hook,
            audio=audio,
            content=content,
            recommendations=recommendations,
            video_info=video_info,
        )

    def _get_video_info(self, video_path: str) -> Dict[str, Any]:
        """Extract video metadata."""
        cap = cv2.VideoCapture(video_path)

        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        duration = frame_count / fps if fps > 0 else 0

        cap.release()

        return {
            'width': width,
            'height': height,
            'fps': fps,
            'frameCount': frame_count,
            'duration': duration,
            'aspectRatio': width / height if height > 0 else 0,
            'resolution': f'{width}x{height}',
        }

    def _analyze_technical(self, video_path: str, video_info: Dict[str, Any]) -> TechnicalScore:
        """Analyze technical quality."""
        width = video_info['width']
        height = video_info['height']
        fps = video_info['fps']
        aspect_ratio = video_info['aspectRatio']

        # Resolution score
        if width >= 1080 and height >= 1920:
            resolution_score = 100
        elif width >= 720 and height >= 1280:
            resolution_score = 70
        elif width >= 480 and height >= 854:
            resolution_score = 40
        else:
            resolution_score = 20

        # Aspect ratio score (9:16 is optimal)
        optimal_ratio = TIKTOK_OPTIMAL['aspect_ratio']
        ratio_diff = abs(aspect_ratio - optimal_ratio)
        if ratio_diff < 0.01:
            aspect_score = 100
        elif ratio_diff < 0.1:
            aspect_score = 80
        elif ratio_diff < 0.2:
            aspect_score = 50
        else:
            aspect_score = 30

        # FPS score
        if fps >= 30:
            fps_score = 100
        elif fps >= 24:
            fps_score = 80
        else:
            fps_score = 50

        # Analyze frames for lighting and blur
        lighting_scores = []
        blur_scores = []
        cap = cv2.VideoCapture(video_path)

        # Sample 10 frames throughout the video
        frame_count = video_info['frameCount']
        sample_indices = [int(i * frame_count / 10) for i in range(10)]

        for idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret:
                continue

            # Lighting analysis (histogram)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            mean_brightness = np.mean(gray)
            lighting_scores.append(self._score_lighting(mean_brightness))

            # Blur detection (Laplacian variance)
            laplacian_var = cv2.Laplacian(gray, cv2.CV_64F).var()
            blur_scores.append(self._score_blur(laplacian_var))

        cap.release()

        lighting_score = int(np.mean(lighting_scores)) if lighting_scores else 50
        blur_score = int(np.mean(blur_scores)) if blur_scores else 50

        return TechnicalScore(
            resolution=resolution_score,
            aspect_ratio=aspect_score,
            lighting=lighting_score,
            blur=blur_score,
            fps=fps_score,
            details={
                'actualResolution': f'{width}x{height}',
                'actualFps': fps,
                'actualAspectRatio': round(aspect_ratio, 3),
                'isVertical': aspect_ratio < 1,
            }
        )

    def _score_lighting(self, mean_brightness: float) -> int:
        """Score lighting based on mean brightness (0-255)."""
        # Optimal is around 127 (middle gray)
        if 80 <= mean_brightness <= 180:
            return 100
        elif 50 <= mean_brightness <= 200:
            return 70
        elif 30 <= mean_brightness <= 220:
            return 50
        else:
            return 30

    def _score_blur(self, laplacian_var: float) -> int:
        """Score blur based on Laplacian variance."""
        # Higher variance = sharper image
        if laplacian_var > 500:
            return 100
        elif laplacian_var > 200:
            return 80
        elif laplacian_var > 100:
            return 60
        elif laplacian_var > 50:
            return 40
        else:
            return 20

    def _analyze_hook(self, video_path: str, video_info: Dict[str, Any]) -> HookScore:
        """Analyze the first 3 seconds of the video."""
        cap = cv2.VideoCapture(video_path)
        fps = video_info['fps']

        # Get frames from first 3 seconds
        frames_to_analyze = int(fps * 3)
        frames = []
        face_detected = False
        scene_changes = 0
        movement_scores = []

        prev_frame = None

        for i in range(frames_to_analyze):
            ret, frame = cap.read()
            if not ret:
                break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            frames.append(gray)

            # Detect faces
            if not face_detected:
                faces = self.face_cascade.detectMultiScale(gray, 1.1, 4)
                if len(faces) > 0:
                    face_detected = True

            # Calculate movement (frame difference)
            if prev_frame is not None:
                diff = cv2.absdiff(gray, prev_frame)
                movement = np.mean(diff)
                movement_scores.append(movement)

                # Detect scene change (large difference)
                if movement > 30:
                    scene_changes += 1

            prev_frame = gray

        cap.release()

        # Score movement (higher is more engaging)
        avg_movement = np.mean(movement_scores) if movement_scores else 0
        if avg_movement > 20:
            movement_score = 100
        elif avg_movement > 10:
            movement_score = 80
        elif avg_movement > 5:
            movement_score = 60
        else:
            movement_score = 40

        # First 3 seconds engagement score
        engagement_score = movement_score
        if scene_changes >= 2:
            engagement_score = min(100, engagement_score + 10)
        if face_detected:
            engagement_score = min(100, engagement_score + 10)

        return HookScore(
            first_3_seconds=engagement_score,
            movement=movement_score,
            face_detected=face_detected,
            scene_changes=scene_changes,
            details={
                'avgMovement': round(avg_movement, 2),
                'framesAnalyzed': len(frames),
            }
        )

    def _analyze_audio(self, video_path: str) -> AudioScore:
        """Analyze audio quality."""
        if not HAS_LIBROSA:
            return AudioScore(
                levels=50,
                clarity=50,
                has_audio=True,
                is_silent=False,
                details={'error': 'librosa not installed'}
            )

        try:
            # Extract audio
            y, sr = librosa.load(video_path, sr=None)

            if len(y) == 0:
                return AudioScore(
                    levels=0,
                    clarity=0,
                    has_audio=False,
                    is_silent=True,
                    details={}
                )

            # Check if mostly silent
            rms = librosa.feature.rms(y=y)[0]
            avg_rms = np.mean(rms)

            if avg_rms < 0.01:
                return AudioScore(
                    levels=0,
                    clarity=0,
                    has_audio=True,
                    is_silent=True,
                    details={'avgRms': float(avg_rms)}
                )

            # Calculate audio levels score
            # Convert RMS to dB
            db = librosa.amplitude_to_db(rms, ref=np.max)
            avg_db = np.mean(db)

            # Optimal is around -14 LUFS (we approximate with dB)
            if -20 <= avg_db <= -10:
                levels_score = 100
            elif -25 <= avg_db <= -5:
                levels_score = 80
            else:
                levels_score = 50

            # Clarity score (spectral centroid - higher = brighter/clearer)
            spectral_centroid = librosa.feature.spectral_centroid(y=y, sr=sr)[0]
            avg_centroid = np.mean(spectral_centroid)

            if avg_centroid > 2000:
                clarity_score = 100
            elif avg_centroid > 1000:
                clarity_score = 80
            else:
                clarity_score = 60

            return AudioScore(
                levels=levels_score,
                clarity=clarity_score,
                has_audio=True,
                is_silent=False,
                details={
                    'avgDb': round(float(avg_db), 2),
                    'avgRms': round(float(avg_rms), 4),
                    'spectralCentroid': round(float(avg_centroid), 2),
                }
            )

        except Exception as e:
            logger.error(f'Audio analysis failed: {e}')
            return AudioScore(
                levels=50,
                clarity=50,
                has_audio=True,
                is_silent=False,
                details={'error': str(e)}
            )

    def _analyze_content(self, video_path: str, video_info: Dict[str, Any]) -> ContentScore:
        """Analyze content characteristics."""
        duration = video_info['duration']
        frame_count = video_info['frameCount']
        fps = video_info['fps']

        # Detect faces throughout video
        cap = cv2.VideoCapture(video_path)
        face_count = 0
        text_regions_count = 0

        # Sample 20 frames throughout video
        sample_indices = [int(i * frame_count / 20) for i in range(20)]

        for idx in sample_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret:
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

            # Detect faces
            faces = self.face_cascade.detectMultiScale(gray, 1.1, 4)
            if len(faces) > 0:
                face_count += 1

            # Simple caption detection (white text on dark or dark text on light)
            # Look for high contrast regions at bottom of frame
            bottom_region = gray[-100:, :]
            edges = cv2.Canny(bottom_region, 100, 200)
            if np.sum(edges) > 10000:  # Significant edge activity in bottom
                text_regions_count += 1

        cap.release()

        has_faces = face_count > len(sample_indices) * 0.3  # Faces in >30% of samples
        has_captions = text_regions_count > len(sample_indices) * 0.5  # Text in >50%

        # Scene detection for pacing
        scene_count = 1
        if HAS_SCENEDETECT:
            try:
                scenes = detect(video_path, ContentDetector())
                scene_count = len(scenes)
            except Exception as e:
                logger.warning(f'Scene detection failed: {e}')

        # Calculate pacing score
        scenes_per_min = (scene_count / duration) * 60 if duration > 0 else 0
        optimal_min, optimal_max = TIKTOK_OPTIMAL['scene_changes_per_min']

        if optimal_min <= scenes_per_min <= optimal_max:
            pacing_score = 100
        elif scenes_per_min < optimal_min:
            pacing_score = 60  # Too slow
        else:
            pacing_score = 70  # Too fast but better than too slow

        # Duration optimization
        opt_min, opt_max = TIKTOK_OPTIMAL['optimal_duration']
        duration_optimal = opt_min <= duration <= opt_max

        # Watermark detection (placeholder - would need trained model for accuracy)
        no_watermarks = True  # Assume no watermarks for now

        return ContentScore(
            has_captions=has_captions,
            has_faces=has_faces,
            pacing=pacing_score,
            no_watermarks=no_watermarks,
            scene_count=scene_count,
            duration_optimal=duration_optimal,
            details={
                'faceSamples': face_count,
                'totalSamples': len(sample_indices),
                'scenesPerMin': round(scenes_per_min, 2),
                'duration': round(duration, 2),
            }
        )

    def _calculate_overall_score(
        self,
        technical: TechnicalScore,
        hook: HookScore,
        audio: AudioScore,
        content: ContentScore
    ) -> int:
        """Calculate weighted overall score."""
        weights = {
            'technical': 0.2,
            'hook': 0.35,  # Hook is most important
            'audio': 0.2,
            'content': 0.25,
        }

        score = (
            technical.overall * weights['technical'] +
            hook.overall * weights['hook'] +
            audio.overall * weights['audio'] +
            content.overall * weights['content']
        )

        return int(round(score))

    def _generate_recommendations(
        self,
        technical: TechnicalScore,
        hook: HookScore,
        audio: AudioScore,
        content: ContentScore,
        video_info: Dict[str, Any]
    ) -> List[str]:
        """Generate actionable recommendations."""
        recommendations = []

        # Technical recommendations
        if technical.resolution < 70:
            recommendations.append('Upgrade to 1080x1920 resolution for best quality')
        if technical.aspect_ratio < 70:
            recommendations.append('Use 9:16 vertical format for TikTok')
        if technical.lighting < 60:
            recommendations.append('Improve lighting - the video appears too dark or bright')
        if technical.blur < 60:
            recommendations.append('Reduce motion blur or use better focus')
        if technical.fps < 80:
            recommendations.append('Record at 30fps or higher for smoother playback')

        # Hook recommendations
        if hook.overall < 70:
            recommendations.append('Make the first 3 seconds more engaging with action or surprise')
        if hook.movement < 60:
            recommendations.append('Add more movement/action in the opening')
        if not hook.face_detected:
            recommendations.append('Consider showing a face early - videos with faces perform better')

        # Audio recommendations
        if audio.is_silent:
            recommendations.append('Add audio - 85% of TikTok videos have sound')
        elif audio.overall < 70:
            recommendations.append('Improve audio quality and levels')

        # Content recommendations
        if not content.has_captions:
            recommendations.append('Add captions - 85% of viewers watch with sound off')
        if content.pacing < 70:
            recommendations.append('Improve pacing - aim for 3-5 scene changes per minute')
        if not content.duration_optimal:
            duration = video_info['duration']
            if duration < 15:
                recommendations.append('Consider making the video slightly longer (15-60 seconds optimal)')
            elif duration > 60:
                recommendations.append('Consider shorter video (15-60 seconds performs best)')

        # Limit to top 5 recommendations
        return recommendations[:5] if recommendations else ['Your video looks ready for TikTok!']


# Initialize analyzer
analyzer = VideoAnalyzer()


# API Routes

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint."""
    return jsonify({'status': 'ok', 'service': 'tiktok-score'})


@app.route('/analyze', methods=['POST'])
def analyze():
    """Analyze a video file."""
    data = request.get_json()

    if not data or 'videoPath' not in data:
        return jsonify({'success': False, 'error': 'No video path provided'}), 400

    try:
        result = analyzer.analyze(data['videoPath'])

        return jsonify({
            'success': True,
            'result': {
                'overallScore': result.overall_score,
                'technical': asdict(result.technical),
                'hook': asdict(result.hook),
                'audio': asdict(result.audio),
                'content': asdict(result.content),
                'recommendations': result.recommendations,
                'videoInfo': result.video_info,
            }
        })
    except Exception as e:
        logger.error(f'Analysis failed: {e}')
        return jsonify({'success': False, 'error': str(e)}), 400


@app.route('/analyze/quick', methods=['POST'])
def analyze_quick():
    """Quick analysis - technical quality only."""
    data = request.get_json()

    if not data or 'videoPath' not in data:
        return jsonify({'success': False, 'error': 'No video path provided'}), 400

    try:
        video_info = analyzer._get_video_info(data['videoPath'])
        technical = analyzer._analyze_technical(data['videoPath'], video_info)

        return jsonify({
            'success': True,
            'result': {
                'technical': asdict(technical),
                'videoInfo': video_info,
            }
        })
    except Exception as e:
        logger.error(f'Quick analysis failed: {e}')
        return jsonify({'success': False, 'error': str(e)}), 400


if __name__ == '__main__':
    logger.info(f'Starting TikTok Score analyzer on port {ANALYZER_PORT}')
    app.run(host='127.0.0.1', port=ANALYZER_PORT, debug=False)
