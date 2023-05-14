export class LocalRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.startTime = null;
  }

  async startRecording(stream) {
    this.mediaRecorder = new MediaRecorder(stream);
    this.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) {
        this.recordedChunks.push(event.data);
      }
    });
    this.mediaRecorder.start();
    this.startTime = Date.now();
  }

  stopRecording() {
    return new Promise((resolve, reject) => {
      this.mediaRecorder.addEventListener("stop", () => {
        const blob = new Blob(this.recordedChunks, { type: "video/webm" });
        const videoUrl = URL.createObjectURL(blob);
        const totalTime = (Date.now() - this.startTime) / 1000;
        resolve({ blob, videoUrl, totalTime });
      });

      this.mediaRecorder.addEventListener("error", (error) => {
        reject(error);
      });

      this.mediaRecorder.stop();
    });
  }
}