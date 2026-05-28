// ---------------------------------------------------------------------------
// Audio Capture Utility — AIB+ SaaS Engine
// ---------------------------------------------------------------------------
// Basic wrapper around MediaRecorder API for capturing client voice feedback.
// In the future, the resulting Blob can be sent to Whisper or another STT API.
// ---------------------------------------------------------------------------

export class AudioCaptureService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  
  /**
   * Requests microphone permissions and starts recording.
   */
  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(stream);
      this.audioChunks = [];

      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.start();
      console.log('[AIB+ Audio] Recording started');
    } catch (error) {
      console.error('[AIB+ Audio] Error accessing microphone:', error);
      throw new Error('Microphone access denied or unavailable.');
    }
  }

  /**
   * Stops recording and returns the captured audio as a Blob (typically webm/ogg).
   */
  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        return reject(new Error('No active recording to stop.'));
      }

      this.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
        console.log('[AIB+ Audio] Recording stopped, generated blob size:', audioBlob.size);
        
        // Stop all tracks to release the microphone hardware
        this.mediaRecorder?.stream.getTracks().forEach(track => track.stop());
        this.mediaRecorder = null;
        
        resolve(audioBlob);
      };

      this.mediaRecorder.stop();
    });
  }
}

export const audioService = new AudioCaptureService();
