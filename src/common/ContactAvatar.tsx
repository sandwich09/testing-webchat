'use client';

import { useState } from 'react';

import { avatarColor, initialOf } from '@/common/common.logic';

type ContactAvatarProps = {
  name: string;
  pictureUrl: string | null;
  contactId: string;
  size: 28 | 32 | 44 | 56;
};

/** Profile picture, or the first letter of the name on a solid colour when there is none or it fails to load. */
export function ContactAvatar({ name, pictureUrl, contactId, size }: ContactAvatarProps) {
  // Remember which URL failed so a new picture for the same contact is tried again.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showPicture = pictureUrl !== null && pictureUrl !== '' && pictureUrl !== failedUrl;

  if (showPicture) {
    return (
      // A plain <img> with an empty alt: the name is always shown next to the picture (ui-screens 1.7).
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={pictureUrl}
        alt=""
        loading="lazy"
        width={size}
        height={size}
        onError={() => {
          setFailedUrl(pictureUrl);
        }}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full leading-none font-bold text-white select-none"
      style={{
        width: size,
        height: size,
        backgroundColor: avatarColor(contactId),
        fontSize: Math.round(size * 0.4),
      }}
    >
      {initialOf(name)}
    </span>
  );
}
