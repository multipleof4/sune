import { asDataURL, imgToWebp, b64 } from './utils.js';

export async function toAttach(file) {
  if (!file) return null;
  if (file instanceof File) {
    const name = file.name || 'file', mime = (file.type || 'application/octet-stream').toLowerCase();
    if (/^image\//.test(mime) || /\.(png|jpe?g|webp|gif)$/i.test(name)) {
      const data = mime === 'image/webp' || /\.webp$/i.test(name) ? await asDataURL(file) : await imgToWebp(file, 2048, 94);
      return { type: 'image_url', image_url: { url: data } };
    }
    if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
      const data = await asDataURL(file), bin = b64(data);
      return { type: 'file', file: { filename: name.endsWith('.pdf') ? name : name + '.pdf', file_data: bin } };
    }
    if (/^audio\//.test(mime) || /\.(wav|mp3)$/i.test(name)) {
      const data = await asDataURL(file), bin = b64(data), fmt = /mp3/.test(mime) || /\.mp3$/i.test(name) ? 'mp3' : 'wav';
      return { type: 'input_audio', input_audio: { data: bin, format: fmt } };
    }
    const data = await asDataURL(file), bin = b64(data);
    return { type: 'file', file: { filename: name, file_data: bin } };
  }
  if (file && file.name == null && file.data) {
    const name = file.name || 'file', mime = (file.mime || 'application/octet-stream').toLowerCase();
    if (/^image\//.test(mime)) {
      const url = `data:${mime};base64,${file.data}`;
      return { type: 'image_url', image_url: { url } };
    }
    if (mime === 'application/pdf') {
      return { type: 'file', file: { filename: name, file_data: file.data } };
    }
    if (/^audio\//.test(mime)) {
      const fmt = /mp3/.test(mime) ? 'mp3' : 'wav';
      return { type: 'input_audio', input_audio: { data: file.data, format: fmt } };
    }
    return { type: 'file', file: { filename: name, file_data: file.data } };
  }
  return null;
}
