// Zamiennik komponentow z @coinbase/onchainkit/identity.
// Hooki (useName/useAvatar) mieszkaja w app/utils/identity i sa tu re-eksportowane,
// zeby jeden import zalatwial cale API, tak jak wczesniej w OnchainKit.

export { Avatar, AvatarPlaceholder } from './Avatar';
export type { AvatarProps } from './Avatar';

export { Name } from './Name';
export type { NameProps } from './Name';

export { Address } from './Address';
export type { AddressProps } from './Address';

export { Identity } from './Identity';
export type { IdentityProps } from './Identity';

export { IdentityCard } from './IdentityCard';
export type { IdentityCardProps } from './IdentityCard';

export { IdentityContext, useIdentityContext } from './IdentityContext';
export type { IdentityContextValue } from './IdentityContext';

export { useName } from '@/app/utils/identity/useName';
export { useAvatar } from '@/app/utils/identity/useAvatar';
