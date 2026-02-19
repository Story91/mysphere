// Avatar Creator Types

// DiceBear style options
export type DiceBearStyle = 
  | 'adventurer'
  | 'adventurer-neutral'
  | 'avataaars'
  | 'avataaars-neutral'
  | 'big-ears'
  | 'big-ears-neutral'
  | 'big-smile'
  | 'bottts'
  | 'bottts-neutral'
  | 'croodles'
  | 'croodles-neutral'
  | 'fun-emoji'
  | 'icons'
  | 'identicon'
  | 'initials'
  | 'lorelei'
  | 'lorelei-neutral'
  | 'micah'
  | 'miniavs'
  | 'notionists'
  | 'notionists-neutral'
  | 'open-peeps'
  | 'personas'
  | 'pixel-art'
  | 'pixel-art-neutral'
  | 'rings'
  | 'shapes'
  | 'thumbs';

// DiceBear style configuration for UI
export interface DiceBearStyleOption {
  id: DiceBearStyle;
  name: string;
  icon: string;
  description: string;
}

// Available DiceBear styles for Base Avatar
export const DICEBEAR_STYLES: DiceBearStyleOption[] = [
  { id: 'adventurer', name: 'Adventurer', icon: '🧝', description: 'Illustrated adventure characters' },
  { id: 'avataaars', name: 'Avataaars', icon: '👤', description: 'Classic cartoon avatars' },
  { id: 'big-ears', name: 'Big Ears', icon: '🐰', description: 'Cute characters with big ears' },
  { id: 'big-smile', name: 'Big Smile', icon: '😊', description: 'Happy smiling faces' },
  { id: 'bottts', name: 'Robots', icon: '🤖', description: 'Colorful robot avatars' },
  { id: 'croodles', name: 'Croodles', icon: '✏️', description: 'Hand-drawn doodle style' },
  { id: 'fun-emoji', name: 'Fun Emoji', icon: '😜', description: 'Playful emoji faces' },
  { id: 'lorelei', name: 'Lorelei', icon: '👩', description: 'Modern illustrated portraits' },
  { id: 'micah', name: 'Micah', icon: '🎨', description: 'Artistic illustrated faces' },
  { id: 'miniavs', name: 'Miniavs', icon: '👶', description: 'Cute mini avatars' },
  { id: 'notionists', name: 'Notionists', icon: '📝', description: 'Notion-style characters' },
  { id: 'open-peeps', name: 'Open Peeps', icon: '🙋', description: 'Hand-drawn people' },
  { id: 'personas', name: 'Personas', icon: '🎭', description: 'Character personas' },
  { id: 'pixel-art', name: 'Pixel Art', icon: '👾', description: '8-bit retro style' },
];

// Simple DiceBear config - just seed, style, and background
export interface DiceBearConfig {
  seed: string;
  style: DiceBearStyle;
  backgroundColor: string;
  flip: boolean;
  radius: number; // 0-50 for rounded corners
}

// AI Art styles for final generation
export type AIArtStyle = 
  | 'pixel-art'
  | 'ghibli'
  | 'anime'
  | 'realistic'
  | '3d-cartoon'
  | 'cyberpunk'
  | 'watercolor'
  | 'comic'
  | 'base-blue';

export interface AIStyleOption {
  id: AIArtStyle;
  name: string;
  icon: string;
  description: string;
  promptSuffix: string;
}

// Avatar configuration for DiceBear
export interface AvatarConfig {
  // Base
  seed: string;
  
  // Skin
  skinColor: string;
  
  // Hair
  hair: string;
  hairColor: string;
  
  // Facial Hair
  facialHair: string;
  facialHairColor: string;
  
  // Eyes
  eyes: string;
  eyebrows: string;
  
  // Mouth
  mouth: string;
  
  // Nose
  nose: string;
  
  // Accessories
  accessories: string;
  accessoriesColor: string;
  
  // Glasses
  glasses: string;
  glassesColor: string;
  
  // Clothing
  clothing: string;
  clothingColor: string;
  
  // Background
  backgroundColor: string;
}

// Category for the editor tabs
export type AvatarCategory = 
  | 'skin'
  | 'hair'
  | 'eyes'
  | 'facial-hair'
  | 'accessories'
  | 'glasses'
  | 'clothing'
  | 'background';

export interface CategoryConfig {
  id: AvatarCategory;
  name: string;
  icon: string;
}

// Option item for selection grids
export interface OptionItem {
  id: string;
  name: string;
  preview?: string;
}

// Color option
export interface ColorOption {
  id: string;
  hex: string;
  name: string;
}

// Hair style options (for avataaars style)
export const HAIR_STYLES: OptionItem[] = [
  { id: 'none', name: 'Bald' },
  { id: 'shortHairShortFlat', name: 'Short Flat' },
  { id: 'shortHairShortWaved', name: 'Short Wavy' },
  { id: 'shortHairShortCurly', name: 'Short Curly' },
  { id: 'shortHairSides', name: 'Sides' },
  { id: 'shortHairDreads01', name: 'Dreads' },
  { id: 'shortHairDreads02', name: 'Dreads 2' },
  { id: 'shortHairFrizzle', name: 'Frizzle' },
  { id: 'shortHairShaggyMullet', name: 'Mullet' },
  { id: 'shortHairTheCaesar', name: 'Caesar' },
  { id: 'shortHairTheCaesarSidePart', name: 'Caesar Side' },
  { id: 'longHairBigHair', name: 'Big Hair' },
  { id: 'longHairBob', name: 'Bob' },
  { id: 'longHairBun', name: 'Bun' },
  { id: 'longHairCurly', name: 'Curly Long' },
  { id: 'longHairCurvy', name: 'Curvy' },
  { id: 'longHairDreads', name: 'Long Dreads' },
  { id: 'longHairFrida', name: 'Frida' },
  { id: 'longHairFro', name: 'Fro' },
  { id: 'longHairFroBand', name: 'Fro Band' },
  { id: 'longHairNotTooLong', name: 'Medium' },
  { id: 'longHairMiaWallace', name: 'Mia Wallace' },
  { id: 'longHairShavedSides', name: 'Shaved Sides' },
  { id: 'longHairStraight', name: 'Straight' },
  { id: 'longHairStraight2', name: 'Straight 2' },
  { id: 'longHairStraightStrand', name: 'Strand' },
];

export const FACIAL_HAIR_STYLES: OptionItem[] = [
  { id: 'none', name: 'None' },
  { id: 'beardLight', name: 'Light Beard' },
  { id: 'beardMajestic', name: 'Majestic' },
  { id: 'beardMedium', name: 'Medium Beard' },
  { id: 'moustacheFancy', name: 'Fancy Moustache' },
  { id: 'moustacheMagnum', name: 'Magnum' },
];

export const EYE_STYLES: OptionItem[] = [
  { id: 'default', name: 'Default' },
  { id: 'close', name: 'Closed' },
  { id: 'cry', name: 'Crying' },
  { id: 'dizzy', name: 'Dizzy' },
  { id: 'eyeRoll', name: 'Eye Roll' },
  { id: 'happy', name: 'Happy' },
  { id: 'hearts', name: 'Hearts' },
  { id: 'side', name: 'Side' },
  { id: 'squint', name: 'Squint' },
  { id: 'surprised', name: 'Surprised' },
  { id: 'wink', name: 'Wink' },
  { id: 'winkWacky', name: 'Wink Wacky' },
];

export const EYEBROW_STYLES: OptionItem[] = [
  { id: 'default', name: 'Default' },
  { id: 'defaultNatural', name: 'Natural' },
  { id: 'angry', name: 'Angry' },
  { id: 'angryNatural', name: 'Angry Natural' },
  { id: 'flatNatural', name: 'Flat' },
  { id: 'frownNatural', name: 'Frown' },
  { id: 'raisedExcited', name: 'Excited' },
  { id: 'raisedExcitedNatural', name: 'Excited Natural' },
  { id: 'sadConcerned', name: 'Sad' },
  { id: 'sadConcernedNatural', name: 'Sad Natural' },
  { id: 'unibrowNatural', name: 'Unibrow' },
  { id: 'upDown', name: 'Up Down' },
  { id: 'upDownNatural', name: 'Up Down Natural' },
];

export const MOUTH_STYLES: OptionItem[] = [
  { id: 'default', name: 'Default' },
  { id: 'concerned', name: 'Concerned' },
  { id: 'disbelief', name: 'Disbelief' },
  { id: 'eating', name: 'Eating' },
  { id: 'grimace', name: 'Grimace' },
  { id: 'sad', name: 'Sad' },
  { id: 'screamOpen', name: 'Scream' },
  { id: 'serious', name: 'Serious' },
  { id: 'smile', name: 'Smile' },
  { id: 'tongue', name: 'Tongue' },
  { id: 'twinkle', name: 'Twinkle' },
  { id: 'vomit', name: 'Sick' },
];

export const NOSE_STYLES: OptionItem[] = [
  { id: 'default', name: 'Default' },
];

export const ACCESSORIES_STYLES: OptionItem[] = [
  { id: 'none', name: 'None' },
  { id: 'kurt', name: 'Kurt Glasses' },
  { id: 'prescription01', name: 'Prescription' },
  { id: 'prescription02', name: 'Prescription 2' },
  { id: 'round', name: 'Round' },
  { id: 'sunglasses', name: 'Sunglasses' },
  { id: 'wayfarers', name: 'Wayfarers' },
];

export const CLOTHING_STYLES: OptionItem[] = [
  { id: 'blazerShirt', name: 'Blazer' },
  { id: 'blazerSweater', name: 'Blazer Sweater' },
  { id: 'collarSweater', name: 'Collar Sweater' },
  { id: 'graphicShirt', name: 'Graphic Shirt' },
  { id: 'hoodie', name: 'Hoodie' },
  { id: 'overall', name: 'Overall' },
  { id: 'shirtCrewNeck', name: 'Crew Neck' },
  { id: 'shirtScoopNeck', name: 'Scoop Neck' },
  { id: 'shirtVNeck', name: 'V-Neck' },
];

// Color palettes
export const SKIN_COLORS: ColorOption[] = [
  { id: 'pale', hex: 'ffd5c2', name: 'Pale' },
  { id: 'light', hex: 'edb98a', name: 'Light' },
  { id: 'brown', hex: 'd08b5b', name: 'Brown' },
  { id: 'darkBrown', hex: 'ae5d29', name: 'Dark Brown' },
  { id: 'black', hex: '614335', name: 'Black' },
  { id: 'yellow', hex: 'ffedc2', name: 'Yellow' },
];

export const HAIR_COLORS: ColorOption[] = [
  { id: 'black', hex: '090806', name: 'Black' },
  { id: 'darkBrown', hex: '3d2314', name: 'Dark Brown' },
  { id: 'brown', hex: '6b4423', name: 'Brown' },
  { id: 'lightBrown', hex: 'a67b5b', name: 'Light Brown' },
  { id: 'blonde', hex: 'e8d4a8', name: 'Blonde' },
  { id: 'platinum', hex: 'f5f5f5', name: 'Platinum' },
  { id: 'ginger', hex: 'b55239', name: 'Ginger' },
  { id: 'red', hex: '8b0000', name: 'Red' },
  { id: 'blue', hex: '0052FF', name: 'Base Blue' },
  { id: 'purple', hex: '8b5cf6', name: 'Purple' },
  { id: 'pink', hex: 'ec4899', name: 'Pink' },
  { id: 'green', hex: '10b981', name: 'Green' },
  { id: 'teal', hex: '14b8a6', name: 'Teal' },
  { id: 'gray', hex: '808080', name: 'Gray' },
];

// Base brand background options - only solid colors and gradients
export interface BackgroundOption {
  id: string;
  name: string;
  type: 'solid' | 'gradient';
  value: string; // hex for solid, gradient string
  preview?: string; // preview color for UI
}

export const BACKGROUND_OPTIONS: BackgroundOption[] = [
  // Solid colors
  { id: 'white', name: 'White', type: 'solid', value: 'ffffff', preview: 'ffffff' },
  { id: 'base-blue', name: 'Base Blue', type: 'solid', value: '0052FF', preview: '0052FF' },
  { id: 'base-light-blue', name: 'Light Blue', type: 'solid', value: '6A8BFF', preview: '6A8BFF' },
  { id: 'off-white', name: 'Off White', type: 'solid', value: 'f5f7fa', preview: 'f5f7fa' },
  { id: 'ice-blue', name: 'Ice Blue', type: 'solid', value: 'e6edff', preview: 'e6edff' },
  
  // Gradients
  { id: 'gradient-blue-light', name: 'Blue Fade', type: 'gradient', value: 'linear-gradient(135deg, #0052FF 0%, #6A8BFF 100%)', preview: '0052FF' },
  { id: 'gradient-radial', name: 'Radial Blue', type: 'gradient', value: 'radial-gradient(circle, #6A8BFF 0%, #0052FF 100%)', preview: '0052FF' },
  { id: 'gradient-diagonal', name: 'Diagonal', type: 'gradient', value: 'linear-gradient(45deg, #0052FF 0%, #00A3FF 50%, #0052FF 100%)', preview: '0052FF' },
];

// Legacy support
export const BACKGROUND_COLORS: ColorOption[] = [
  { id: 'white', hex: 'ffffff', name: 'White' },
  { id: 'baseBlue', hex: '0052FF', name: 'Base Blue' },
  { id: 'baseLightBlue', hex: '6A8BFF', name: 'Light Blue' },
];

export const CLOTHING_COLORS: ColorOption[] = [
  { id: 'black', hex: '1f2937', name: 'Black' },
  { id: 'white', hex: 'ffffff', name: 'White' },
  { id: 'gray', hex: '6b7280', name: 'Gray' },
  { id: 'red', hex: 'ef4444', name: 'Red' },
  { id: 'blue', hex: '0052FF', name: 'Base Blue' },
  { id: 'green', hex: '10b981', name: 'Green' },
  { id: 'purple', hex: '8b5cf6', name: 'Purple' },
  { id: 'pink', hex: 'ec4899', name: 'Pink' },
  { id: 'yellow', hex: 'eab308', name: 'Yellow' },
  { id: 'orange', hex: 'f97316', name: 'Orange' },
];

// AI Art Style configurations
export const AI_STYLES: AIStyleOption[] = [
  {
    id: 'pixel-art',
    name: 'Pixel Art',
    icon: '👾',
    description: '8-bit retro gaming style',
    promptSuffix: '8-bit pixel art style, retro game character, clean pixels, no anti-aliasing, pixel perfect, NES/SNES aesthetic',
  },
  {
    id: 'ghibli',
    name: 'Ghibli',
    icon: '🌸',
    description: 'Studio Ghibli anime',
    promptSuffix: 'Studio Ghibli anime style, soft watercolor textures, warm colors, hand-drawn, Hayao Miyazaki inspired, gentle shading, whimsical',
  },
  {
    id: 'anime',
    name: 'Anime',
    icon: '🎌',
    description: 'Japanese anime style',
    promptSuffix: 'high quality anime style, detailed shading, vibrant colors, manga aesthetic, expressive eyes, clean linework',
  },
  {
    id: 'realistic',
    name: 'Realistic',
    icon: '📷',
    description: 'Photorealistic portrait',
    promptSuffix: 'photorealistic portrait, detailed skin texture, professional photography, studio lighting, high resolution',
  },
  {
    id: '3d-cartoon',
    name: '3D Cartoon',
    icon: '🎮',
    description: 'Pixar/Disney 3D style',
    promptSuffix: '3D Pixar style character, smooth render, expressive features, Disney quality, cinematic lighting, subsurface scattering',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    icon: '🌆',
    description: 'Neon futuristic',
    promptSuffix: 'cyberpunk aesthetic, neon lighting, futuristic, glowing accents, tech implants, dystopian city background, purple and cyan colors',
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    icon: '🎨',
    description: 'Soft watercolor art',
    promptSuffix: 'watercolor painting style, soft edges, color bleeding, artistic brush strokes, paper texture, dreamy aesthetic',
  },
  {
    id: 'comic',
    name: 'Comic',
    icon: '💥',
    description: 'American comic book',
    promptSuffix: 'American comic book style, bold outlines, halftone dots, dynamic shading, superhero aesthetic, vibrant colors',
  },
  {
    id: 'base-blue',
    name: 'Base Theme',
    icon: '🔵',
    description: 'Base blockchain aesthetic',
    promptSuffix: 'blue and white color scheme, Base blockchain theme, modern digital art, clean minimal design, tech aesthetic, gradient blue background',
  },
];

// Categories for the editor
export const AVATAR_CATEGORIES: CategoryConfig[] = [
  { id: 'skin', name: 'Skin', icon: '👤' },
  { id: 'hair', name: 'Hair', icon: '💇' },
  { id: 'eyes', name: 'Eyes', icon: '👁️' },
  { id: 'facial-hair', name: 'Beard', icon: '🧔' },
  { id: 'accessories', name: 'Glasses', icon: '👓' },
  { id: 'clothing', name: 'Clothing', icon: '👕' },
  { id: 'background', name: 'Background', icon: '🎨' },
];

// Default avatar configuration
export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  seed: 'base-user',
  skinColor: 'edb98a',
  hair: 'shortHairShortFlat',
  hairColor: '3d2314',
  facialHair: 'none',
  facialHairColor: '3d2314',
  eyes: 'default',
  eyebrows: 'default',
  mouth: 'smile',
  nose: 'default',
  accessories: 'none',
  accessoriesColor: '1f2937',
  glasses: 'none',
  glassesColor: '1f2937',
  clothing: 'hoodie',
  clothingColor: '0052FF',
  backgroundColor: 'white', // Use background option ID
};

