# FlowingMenu Component

Animated menu component with GSAP animations and flowing marquee effects.

## Installation

```bash
npm install gsap
```

## Usage

```tsx
import { FlowingMenu } from './Menu'

const demoItems = [
  { link: '#', text: 'Mojave', image: 'https://picsum.photos/600/400?random=1' },
  { link: '#', text: 'Sonoma', image: 'https://picsum.photos/600/400?random=2' },
  { link: '#', text: 'Monterey', image: 'https://picsum.photos/600/400?random=3' },
  { link: '#', text: 'Sequoia', image: 'https://picsum.photos/600/400?random=4' }
];

<div style={{ height: '600px', position: 'relative' }}>
  <FlowingMenu items={demoItems} />
</div>
```

## Features

- **GSAP Animations**: Smooth transitions and effects
- **Marquee Effects**: Flowing text and image animations
- **Mouse Interaction**: Edge detection for animation direction
- **Responsive Design**: Adapts to container dimensions
- **Customizable**: Easy to modify colors, fonts, and animations

## Props

- `items`: Array of menu items with link, text, and image properties
- Each item supports custom styling and hover effects
