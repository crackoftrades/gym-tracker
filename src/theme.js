export const colors = {
  bg: '#0B0E14',
  bgAlt: '#111621',
  card: '#151B26',
  cardAlt: '#1B2331',
  border: '#26303F',
  borderLight: '#33404F',
  primary: '#4F7CFF',
  primaryDeep: '#2B4FCC',
  accent: '#00E0A4',
  accentDeep: '#00B487',
  lime: '#B6F35C',
  warn: '#FFB020',
  danger: '#FF5A5F',
  text: '#EDF1F7',
  textDim: '#93A0B4',
  textFaint: '#5C6B80',
  white: '#FFFFFF',
};

export const gradients = {
  screen: ['#0B0E14', '#0E1420', '#0B0E14'],
  primary: ['#5B86FF', '#3457E6'],
  accent: ['#00E0A4', '#00B487'],
  hero: ['#243B7A', '#3457E6'],
};

// Accent color per muscle-group category (used for chips / tags).
export const categoryColor = {
  Chest: '#4F7CFF',
  Back: '#00E0A4',
  Legs: '#B6F35C',
  Shoulders: '#FFB020',
  Arms: '#C08BFF',
  Core: '#FF8FA3',
};

// Accent color per split day.
export const splitColor = {
  Push: '#4F7CFF',
  Pull: '#00E0A4',
  Legs: '#B6F35C',
  Upper: '#C08BFF',
  Lower: '#FFB020',
  'Full Body': '#FF8FA3',
};

export const radius = { sm: 8, md: 14, lg: 20, xl: 28 };

export const spacing = (n) => n * 8;

export const shadow = {
  card: {
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  glow: (color) => ({
    shadowColor: color,
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  }),
};
