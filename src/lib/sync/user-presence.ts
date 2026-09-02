const COLORS = [
  "#2563eb", // blue
  "#dc2626", // red
  "#16a34a", // green
  "#9333ea", // purple
  "#ea580c", // orange
  "#0891b2", // cyan
  "#db2777", // pink
  "#ca8a04", // yellow
];

const ANIMALS = [
  "Falcon",
  "Otter",
  "Fox",
  "Panda",
  "Hawk",
  "Wolf",
  "Koala",
  "Dolphin",
];

export function getRandomUserPresence() {
  const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
  const randomAnimal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const randomId = Math.floor(Math.random() * 900 + 100);

  return {
    name: `Guest ${randomAnimal} #${randomId}`,
    color: randomColor,
  };
}
