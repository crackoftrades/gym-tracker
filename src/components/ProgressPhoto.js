import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { signedPhotoUrl } from '../lib/storage';

// Progress photos live in a private bucket, so a stored `photo_url` is an object
// path rather than something an <Image> can load. This resolves it to a signed
// link and renders the placeholder box in the meantime, so the row doesn't
// reflow once the photo arrives.
export default function ProgressPhoto({ value, style, resizeMode = 'cover' }) {
  const [uri, setUri] = useState(null);

  useEffect(() => {
    let alive = true;
    setUri(null);
    signedPhotoUrl(value).then((url) => {
      if (alive) setUri(url);
    });
    return () => {
      alive = false;
    };
  }, [value]);

  if (!uri) return <View style={style} />;
  return <Image source={{ uri }} style={style} resizeMode={resizeMode} />;
}
