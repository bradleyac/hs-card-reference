import { useState } from 'react';

interface CardImageProps {
  cardId: string;
  name: string;
  size?: 256 | 512;
  className?: string;
}

export function renderUrl(cardId: string, size: 256 | 512 = 256): string {
  return `https://art.hearthstonejson.com/v1/render/latest/enUS/${size}x/${cardId}.png`;
}

export function artCropUrl(cardId: string): string {
  return `https://art.hearthstonejson.com/v1/256x/${cardId}.jpg`;
}

type ImageState = 'render' | 'crop' | 'failed';

export function CardImage({ cardId, name, size = 256, className }: CardImageProps) {
  const [state, setState] = useState<ImageState>('render');

  if (state === 'failed') {
    return (
      <div className={`card-image-placeholder ${className ?? ''}`} aria-label={name}>
        <span>{name}</span>
      </div>
    );
  }

  const src = state === 'render' ? renderUrl(cardId, size) : artCropUrl(cardId);

  return (
    <img
      src={src}
      alt={name}
      className={className}
      onError={() => setState(state === 'render' ? 'crop' : 'failed')}
    />
  );
}
