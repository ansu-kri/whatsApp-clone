export type UploadedMedia = {
  mediaUrl: string;
  mediaType: string;
  fileName: string;
};

export function uploadMedia(
  file: File,
  onProgress: (value: number) => void,
): Promise<UploadedMedia> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    const request = new XMLHttpRequest();
    request.open("POST", "http://127.0.0.1:8000/api/upload/");
    const token = localStorage.getItem("token");
    if (token) request.setRequestHeader("authorization", `Bearer ${token}`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable)
        onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(new Error("Network error while uploading media"));
    request.onload = () => {
      let data: any;
      try {
        data = JSON.parse(request.responseText);
      } catch {
        data = {};
      }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(data.detail || "Upload failed"));
        return;
      }
      resolve(data as UploadedMedia);
    };
    request.send(form);
  });
}
