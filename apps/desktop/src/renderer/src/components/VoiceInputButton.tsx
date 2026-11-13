import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Microphone, MicrophoneSolid } from 'iconoir-react';
import { useArchpiStore } from '../store/useArchpiStore';
import { useT } from '../i18n';

export interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
}

export interface VoiceInputHandle {
  startRecording: () => void;
  stopRecording: () => void;
}

export const VoiceInputButton = forwardRef<VoiceInputHandle, VoiceInputButtonProps>(
  ({ onTranscript }, ref) => {
  const { voiceConfig } = useArchpiStore();
  const t = useT();
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    if (isRecording || isTranscribing || !voiceConfig.enabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 500) return;

        setIsTranscribing(true);
        try {
          const endpoint =
            voiceConfig.endpoint?.trim() ||
            'https://api.siliconflow.cn/v1/audio/transcriptions';
          const modelId =
            voiceConfig.modelId?.trim() || 'FunAudioLLM/SenseVoiceSmall';
          const apiKey = voiceConfig.apiKey?.trim();

          const form = new FormData();
          form.append('file', blob, 'recording.webm');
          if (modelId) form.append('model', modelId);

          const headers: Record<string, string> = {};
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

          const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: form
          });

          if (res.ok) {
            const data = await res.json();
            const text = (data.text ?? '').trim();
            if (text) {
              onTranscript(text);
            }
          }
        } catch (err) {
          console.error('Voice transcription failed:', err);
        } finally {
          setIsTranscribing(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch (err) {
      console.error('Microphone access failed:', err);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  useImperativeHandle(ref, () => ({
    startRecording,
    stopRecording
  }));

  if (!voiceConfig.enabled) return null;

  return (
    <button
      type="button"
      data-tooltip={
        isTranscribing
          ? t.workspace.voiceTranscribing
          : isRecording
          ? voiceConfig.mode === 'hold'
            ? t.workspace.voiceRelease
            : t.workspace.voiceStop
          : voiceConfig.mode === 'hold'
          ? t.workspace.voiceHold
          : t.workspace.voiceClick
      }
      disabled={isTranscribing}
      onClick={voiceConfig.mode === 'click' ? toggleRecording : undefined}
      onMouseDown={voiceConfig.mode === 'hold' ? startRecording : undefined}
      onMouseUp={voiceConfig.mode === 'hold' ? stopRecording : undefined}
      onMouseLeave={
        voiceConfig.mode === 'hold' && isRecording ? stopRecording : undefined
      }
      className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-all focus:outline-none ${
        isTranscribing
          ? 'bg-amber-500/20 text-amber-300'
          : isRecording
          ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.6)] animate-pulse'
          : 'bg-[#181a20] text-neutral-400 hover:bg-[#22252e] hover:text-neutral-200'
      }`}
    >
      {isRecording ? (
        <MicrophoneSolid className="h-4 w-4" />
      ) : (
        <Microphone className="h-4 w-4" />
      )}
    </button>
  );
});
