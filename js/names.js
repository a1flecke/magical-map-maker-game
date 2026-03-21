/* Magical Map Maker — Fantasy Name Generator (Theme-Aware) */

const NAME_DATA = {
  'fantasy-overworld': {
    adjectives: ['Whispering', 'Enchanted', 'Golden', 'Misty', 'Twilight', 'Crystal', 'Emerald', 'Silver', 'Ancient', 'Starlit', 'Verdant', 'Moonlit', 'Fabled', 'Hidden', 'Shimmering', 'Crimson', 'Ivory', 'Sacred', 'Forgotten', 'Brave', 'Radiant', 'Eternal'],
    nouns: ['Peaks', 'Hollow', 'Valley', 'Forest', 'Kingdom', 'Realm', 'Glen', 'Meadow', 'Crossing', 'Haven', 'Keep', 'Shore', 'Tower', 'Bridge', 'March', 'Gate', 'Throne', 'Wood', 'Glade', 'Crown', 'Spring', 'Wilds'],
    prefixes: ['Dragon', 'Elf', 'Wizard', 'Knight', 'Griffin', 'Fae', 'Phoenix', 'Rune', 'Storm', 'Hawk']
  },
  'dungeon': {
    adjectives: ['Forgotten', 'Shadow', 'Cursed', 'Haunted', 'Sunken', 'Twisted', 'Burning', 'Silent', 'Shattered', 'Frozen', 'Dark', 'Grim', 'Hollow', 'Wretched', 'Endless', 'Blood', 'Iron', 'Bone', 'Deep', 'Ashen', 'Dread', 'Black'],
    nouns: ['Crypt', 'Labyrinth', 'Vault', 'Tomb', 'Dungeon', 'Chamber', 'Catacombs', 'Lair', 'Pit', 'Passage', 'Depths', 'Cavern', 'Sanctum', 'Abyss', 'Gallery', 'Den', 'Cell', 'Halls', 'Maze', 'Grotto', 'Keep', 'Undercroft'],
    prefixes: ['Spider', 'Lich', 'Skull', 'Rat', 'Goblin', 'Troll', 'Demon', 'Wraith', 'Minotaur', 'Serpent']
  },
  'historical-battlefields': {
    adjectives: ['Crimson', 'Iron', 'Fallen', 'Scarred', 'Burning', 'Cold', 'Thunder', 'Brave', 'Broken', 'Last', 'Fierce', 'Noble', 'Grim', 'Muddy', 'Windswept', 'Bitter', 'Proud', 'Siege', 'Smoke', 'Embattled', 'Gray', 'Blood'],
    nouns: ['Field', 'Ridge', 'Hill', 'Valley', 'Crossing', 'Front', 'Line', 'Pass', 'Siege', 'Fort', 'Stand', 'March', 'Bluff', 'Creek', 'Bridge', 'Garrison', 'Camp', 'Trench', 'Heights', 'Run', 'Landing', 'Bastion'],
    prefixes: ['General', 'Colonel', 'Eagle', 'Cannon', 'Cavalry', 'Shield', 'Sword', 'Arrow', 'Banner', 'Bugle']
  },
  'space': {
    adjectives: ['Nebula', 'Cosmic', 'Void', 'Stellar', 'Quantum', 'Dark', 'Infinite', 'Solar', 'Binary', 'Nova', 'Frozen', 'Blazing', 'Silent', 'Distant', 'Strange', 'Radiant', 'Galactic', 'Ion', 'Zero', 'Plasma', 'Hyper', 'Deep'],
    nouns: ['Expanse', 'Station', 'Frontier', 'Cluster', 'Drift', 'Reach', 'Horizon', 'Sector', 'Rift', 'Array', 'Beacon', 'Haven', 'Gate', 'Forge', 'Nexus', 'Spire', 'Core', 'Ring', 'Vault', 'Run', 'Edge', 'Pinnacle'],
    prefixes: ['Alpha', 'Sigma', 'Omega', 'Nova', 'Zeta', 'Polaris', 'Orion', 'Vega', 'Cygnus', 'Andromeda']
  },
  'jungle': {
    adjectives: ['Emerald', 'Hidden', 'Wild', 'Tangled', 'Steaming', 'Ancient', 'Lost', 'Mossy', 'Verdant', 'Towering', 'Secret', 'Primal', 'Dark', 'Lush', 'Deep', 'Whispering', 'Serpent', 'Savage', 'Misty', 'Dense', 'Tropical', 'Feral'],
    nouns: ['Depths', 'Canopy', 'Ruins', 'Temple', 'Crossing', 'Falls', 'Grove', 'Trail', 'Basin', 'Hollow', 'Creek', 'Marsh', 'Ridge', 'Pool', 'Clearing', 'Pass', 'Heart', 'Cascade', 'Thicket', 'River', 'Reach', 'Bluff'],
    prefixes: ['Jaguar', 'Serpent', 'Monkey', 'Parrot', 'Vine', 'Orchid', 'Fern', 'Tiger', 'Crocodile', 'Toucan']
  },
  'rivers-waterways': {
    adjectives: ['Crystal', 'Winding', 'Silver', 'Rushing', 'Tranquil', 'Deep', 'Misty', 'Babbling', 'Wide', 'Gentle', 'Swift', 'Gleaming', 'Muddy', 'Lazy', 'Sparkling', 'Blue', 'Clear', 'Rolling', 'Cold', 'Still', 'Rising', 'Fresh'],
    nouns: ['Falls', 'Delta', 'Bend', 'Rapids', 'Harbor', 'Shore', 'Cove', 'Pool', 'Strait', 'Channel', 'Bay', 'Inlet', 'Creek', 'Fork', 'Marsh', 'Crossing', 'Landing', 'Eddy', 'Shallows', 'Run', 'Current', 'Narrows'],
    prefixes: ['Otter', 'Salmon', 'Heron', 'Beaver', 'Trout', 'Pike', 'Crane', 'Kingfisher', 'Swan', 'Turtle']
  },
  'prairie-grasslands': {
    adjectives: ['Golden', 'Endless', 'Windswept', 'Sunlit', 'Rolling', 'Amber', 'Wild', 'Open', 'Dusty', 'Wide', 'Lonely', 'Tall', 'Quiet', 'Scorched', 'Boundless', 'Free', 'Warm', 'Faded', 'Pale', 'Copper', 'Dry', 'Long'],
    nouns: ['Plains', 'Prairie', 'Range', 'Bluff', 'Mesa', 'Trail', 'Gulch', 'Basin', 'Creek', 'Flat', 'Ridge', 'Hollow', 'Run', 'Bend', 'Pass', 'Settlement', 'Outpost', 'Post', 'Crossing', 'Valley', 'Field', 'Stretch'],
    prefixes: ['Buffalo', 'Eagle', 'Coyote', 'Hawk', 'Mustang', 'Prairie', 'Sage', 'Thunder', 'Arrow', 'Bison']
  },
  'mountains': {
    adjectives: ['Frozen', 'Towering', 'Jagged', 'Icy', 'Granite', 'Windswept', 'Snow', 'High', 'Steep', 'Misty', 'Cloud', 'Stone', 'Crystal', 'Silent', 'Ancient', 'Cold', 'Rocky', 'Iron', 'White', 'Stark', 'Eagle', 'Sheer'],
    nouns: ['Peak', 'Summit', 'Pass', 'Ridge', 'Glacier', 'Crag', 'Valley', 'Gorge', 'Canyon', 'Cliff', 'Ledge', 'Basin', 'Col', 'Spire', 'Crown', 'Hollow', 'Reach', 'Spine', 'Horn', 'Shelf', 'Cairn', 'Face'],
    prefixes: ['Goat', 'Eagle', 'Bear', 'Wolf', 'Ram', 'Yeti', 'Falcon', 'Lynx', 'Glacier', 'Storm']
  },
  'continents-world': {
    adjectives: ['Grand', 'Ancient', 'Vast', 'Sprawling', 'Mighty', 'Uncharted', 'Storied', 'Fabled', 'Majestic', 'New', 'Old', 'Greater', 'Northern', 'Southern', 'Eastern', 'Western', 'Central', 'Middle', 'Upper', 'Lower', 'Inner', 'Outer'],
    nouns: ['Empire', 'Continent', 'Realm', 'Dominion', 'Lands', 'Seas', 'Kingdom', 'Isles', 'Coast', 'Expanse', 'Reaches', 'Territories', 'Provinces', 'Borders', 'Federation', 'Archipelago', 'World', 'Globe', 'Peninsula', 'Strait', 'Alliance', 'Hemisphere'],
    prefixes: ['Crown', 'Atlas', 'Compass', 'Meridian', 'Dragon', 'Phoenix', 'Lion', 'Trident', 'Shield', 'Star']
  }
};

const PATTERNS = [
  (adj, noun, prefix, noun2) => 'The ' + adj + ' ' + noun,
  (adj, noun, prefix, noun2) => prefix + "'s " + noun,
  (adj, noun, prefix, noun2) => adj + ' ' + noun,
  (adj, noun, prefix, noun2) => 'The ' + noun + ' of ' + prefix,
  (adj, noun, prefix, noun2) => adj + ' ' + noun + ' of ' + noun2,
  (adj, noun, prefix, noun2) => prefix + ' ' + adj + ' ' + noun
];

class NameGenerator {
  static generate(themeId) {
    const data = NAME_DATA[themeId] || NAME_DATA['fantasy-overworld'];
    const adj = data.adjectives[Math.floor(Math.random() * data.adjectives.length)];
    const noun = data.nouns[Math.floor(Math.random() * data.nouns.length)];
    const prefix = data.prefixes[Math.floor(Math.random() * data.prefixes.length)];

    // Pick a second distinct noun for "X of Y" patterns
    const otherNouns = data.nouns.filter(n => n !== noun);
    const noun2 = otherNouns[Math.floor(Math.random() * otherNouns.length)] || noun;

    const pattern = PATTERNS[Math.floor(Math.random() * PATTERNS.length)];
    let name = pattern(adj, noun, prefix, noun2);

    // For space theme, sometimes add a designation number
    if (themeId === 'space' && Math.random() < 0.3) {
      name += '-' + (Math.floor(Math.random() * 99) + 1);
    }

    return name;
  }
}
