import { useState, useEffect } from 'react';
import { FileText, Trash2, Download, Search, Cloud, CloudOff } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';

interface SavedTranscript {
  id: string;
  fileName: string;
  filePath: string;
  text: string;
  language: string;
  duration: number;
  createdAt: string;
  syncedToCloud: boolean;
}

export function FileList() {
  const [transcripts, setTranscripts] = useLocalStorage<SavedTranscript[]>('saved-transcripts', []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredTranscripts = transcripts.filter(
    (t) =>
      t.fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedTranscript = transcripts.find((t) => t.id === selectedId);

  const handleDelete = (id: string) => {
    setTranscripts((prev) => prev.filter((t) => t.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
    }
  };

  const handleExport = (transcript: SavedTranscript) => {
    const blob = new Blob([transcript.text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcript.fileName.replace(/\.[^.]+$/, '')}_transcript.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (transcripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-16rem)]">
        <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground text-sm">No transcripts yet</p>
        <p className="text-muted-foreground/70 text-xs mt-1">
          Transcribe some files to see them here
        </p>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-16rem)]">
      {/* File list sidebar */}
      <div className="w-80 flex-shrink-0 flex flex-col border rounded-lg overflow-hidden">
        {/* Search */}
        <div className="p-3 border-b">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search transcripts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-muted rounded-md border-0 focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-auto">
          {filteredTranscripts.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm py-8">
              No transcripts match your search
            </p>
          ) : (
            <ul className="divide-y">
              {filteredTranscripts.map((transcript) => (
                <li key={transcript.id}>
                  <button
                    onClick={() => setSelectedId(transcript.id)}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                      selectedId === transcript.id ? 'bg-muted' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">
                          {transcript.fileName}
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {transcript.text.slice(0, 100)}...
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            {formatDate(transcript.createdAt)}
                          </span>
                          {transcript.syncedToCloud ? (
                            <Cloud className="w-3 h-3 text-primary" />
                          ) : (
                            <CloudOff className="w-3 h-3 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Stats */}
        <div className="p-3 border-t bg-muted/30 text-xs text-muted-foreground">
          {transcripts.length} transcript{transcripts.length !== 1 ? 's' : ''} saved
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col border rounded-lg overflow-hidden">
        {selectedTranscript ? (
          <>
            {/* Header */}
            <div className="p-4 border-b flex items-start justify-between">
              <div>
                <h3 className="font-medium">{selectedTranscript.fileName}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{formatDate(selectedTranscript.createdAt)}</span>
                  <span>Duration: {formatDuration(selectedTranscript.duration)}</span>
                  <span>Language: {selectedTranscript.language}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleExport(selectedTranscript)}
                  className="p-2 rounded hover:bg-muted text-muted-foreground"
                  title="Export as text file"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(selectedTranscript.id)}
                  className="p-2 rounded hover:bg-muted text-muted-foreground hover:text-destructive"
                  title="Delete transcript"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 p-4 overflow-auto">
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {selectedTranscript.text}
              </p>
            </div>

            {/* Sync status */}
            <div className="p-3 border-t bg-muted/30">
              <div className="flex items-center gap-2 text-xs">
                {selectedTranscript.syncedToCloud ? (
                  <>
                    <Cloud className="w-3.5 h-3.5 text-primary" />
                    <span className="text-muted-foreground">Synced to CrowTerminal Cloud</span>
                  </>
                ) : (
                  <>
                    <CloudOff className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Not synced</span>
                    <button className="text-primary hover:underline ml-auto">
                      Sync now
                    </button>
                  </>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Select a transcript to view
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
