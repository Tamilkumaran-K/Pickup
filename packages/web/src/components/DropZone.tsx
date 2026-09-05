import React, { useState, useRef } from 'react';
import { Device } from '@dropflow/shared';
import {
  UploadCloud,
  File as FileIcon,
  Send,
  X,
  FileText,
  Link as LinkIcon,
  Sparkles,
  Layers,
  Image as ImageIcon,
  Film,
  FileCode,
} from 'lucide-react';
import { sounds } from '../services/soundEffects.js';

interface DropZoneProps {
  selectedDevice: Device | null;
  onSendFile: (file: File) => void;
  onSendText?: (text: string) => void;
  disabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function getFileCategoryIcon(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'heic'].includes(ext)) {
    return <ImageIcon size={28} />;
  }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) {
    return <Film size={28} />;
  }
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'json', 'html', 'css', 'rs', 'go'].includes(ext)) {
    return <FileCode size={28} />;
  }
  return <FileIcon size={28} />;
}

export const DropZone: React.FC<DropZoneProps> = ({
  selectedDevice,
  onSendFile,
  onSendText,
  disabled,
}) => {
  const [activeTab, setActiveTab] = useState<'files' | 'clipboard'>('files');
  const [isDragActive, setIsDragActive] = useState(false);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [textSnippet, setTextSnippet] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUrl = textSnippet.trim().startsWith('http://') || textSnippet.trim().startsWith('https://');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isDragActive) {
      setIsDragActive(true);
      sounds.playClick();
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (disabled) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setStagedFile(file);
      sounds.playClick();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setStagedFile(e.target.files[0]);
      sounds.playClick();
    }
  };

  const handleTriggerSendFile = () => {
    if (stagedFile) {
      sounds.playClick();
      onSendFile(stagedFile);
      setStagedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTriggerSendText = () => {
    if (textSnippet.trim() && onSendText) {
      sounds.playClick();
      onSendText(textSnippet.trim());
      setTextSnippet('');
    }
  };

  return (
    <div className="drop-studio-container" id="drop-studio">
      {/* Studio Mode Selector */}
      <div className="drop-studio-tabs">
        <button
          id="mode-files-tab"
          className={`studio-tab-btn ${activeTab === 'files' ? 'active' : ''}`}
          onClick={() => {
            sounds.playClick();
            setActiveTab('files');
          }}
        >
          <Layers size={15} /> Files &amp; Media Drop
        </button>

        <button
          id="mode-clipboard-tab"
          className={`studio-tab-btn ${activeTab === 'clipboard' ? 'active' : ''}`}
          onClick={() => {
            sounds.playClick();
            setActiveTab('clipboard');
          }}
        >
          <Sparkles size={15} /> Quick Text / Clipboard Drop
        </button>
      </div>

      {activeTab === 'files' ? (
        <div
          id="file-drop-zone"
          className={`dropzone-container ${isDragActive ? 'drag-active' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!stagedFile && fileInputRef.current) {
              fileInputRef.current.click();
            }
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />

          {stagedFile ? (
            <div className="staged-file-card" onClick={(e) => e.stopPropagation()}>
              <div className="staged-file-icon">
                {getFileCategoryIcon(stagedFile.name)}
              </div>

              <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
                <div className="staged-file-name" title={stagedFile.name}>
                  {stagedFile.name}
                </div>
                <div className="staged-file-meta">
                  <span className="font-mono">{formatBytes(stagedFile.size)}</span>
                  <span>•</span>
                  <span>{stagedFile.type || 'Binary Document'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  id="send-file-btn"
                  className="btn btn-primary"
                  disabled={!selectedDevice || disabled}
                  onClick={handleTriggerSendFile}
                >
                  <Send size={15} />
                  {selectedDevice ? `Drop on ${selectedDevice.name}` : 'Select a device above'}
                </button>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '8px 12px' }}
                  onClick={() => {
                    setStagedFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  title="Remove staged file"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          ) : (
            <div className="dropzone-empty-content">
              <div className="dropzone-icon">
                <UploadCloud size={30} />
              </div>
              <div className="dropzone-title">
                {selectedDevice
                  ? `Drop files to transfer to ${selectedDevice.name}`
                  : 'Drag & drop any file here, or click to browse'}
              </div>
              <div className="dropzone-subtitle">
                Zero-click auto-save • Direct peer-to-peer over local network • No file size limits
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-drop-container">
          <div style={{ position: 'relative' }}>
            <textarea
              id="clipboard-text-input"
              className="text-drop-input"
              rows={4}
              placeholder="Paste any link, text snippet, token, or notes to drop directly to your peer device..."
              value={textSnippet}
              onChange={(e) => setTextSnippet(e.target.value)}
            />

            <div className="text-drop-footer">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                {isUrl && (
                  <span className="url-detected-badge">
                    <LinkIcon size={12} /> Detected Web URL
                  </span>
                )}
                <span>{textSnippet.length} characters</span>
              </div>

              <button
                id="send-text-btn"
                className="btn btn-primary"
                disabled={!textSnippet.trim() || !selectedDevice || disabled}
                onClick={handleTriggerSendText}
              >
                <Send size={15} />
                {selectedDevice ? `Send to ${selectedDevice.name}` : 'Select a device above'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
