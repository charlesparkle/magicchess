// hero-db.js

export const HERO_DB = [
  // --- BRUISER ---
  { id: 'chou', name: 'Chou', cost: 5, traits: ['Bruiser', 'Mortal Rival', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/a/a9/Hero261-icon.png' },
  { id: 'masha', name: 'Masha', cost: 3, traits: ['Bruiser', 'Heartbond'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/c/c5/Hero881-icon.png' },
  { id: 'yuzhong', name: 'Yu Zhong', cost: 4, traits: ['Bruiser', 'Luminexus'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/5/53/Hero951-icon.png' },
  { id: 'gatotkaca', name: 'Gatotkaca', cost: 2, traits: ['Bruiser', 'Defender', 'Exorcist'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/c/cb/Hero411-icon.png' },
  { id: 'jawhead', name: 'Jawhead', cost: 1, traits: ['Bruiser', 'Neobeasts'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/1/1c/Hero541-icon.png' },
  { id: 'aldous', name: 'Aldous', cost: 2, traits: ['Bruiser', 'Glory League'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/9/95/Hero641-icon.png' },

  // --- DEFENDER ---
  { id: 'paquito', name: 'Paquito', cost: 4, traits: ['Defender', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/3/35/Hero1031-icon.png' },
  { id: 'khufra', name: 'Khufra', cost: 3, traits: ['Defender', 'Soul Vessels'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/c/cd/Hero781-icon.png' },
  { id: 'uranus', name: 'Uranus', cost: 2, traits: ['Defender', 'Neobeasts'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/b/ba/Hero591-icon.png' },
  { id: 'minotaur', name: 'Minotaur', cost: 3, traits: ['Defender', 'Glory League'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/0/08/Hero191-icon.png' },
  { id: 'edith', name: 'Edith', cost: 5, traits: ['Defender', 'Beyond The Clouds'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/3/36/Hero1111-icon.png' },

  // --- DAUNTLESS ---
  { id: 'dyrroth', name: 'Dyrroth', cost: 2, traits: ['Dauntless', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/6/62/Hero851-icon.png' },
  { id: 'gloo', name: 'Gloo', cost: 3, traits: ['Dauntless', 'Soul Vessels'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/4/45/Hero1041-icon.png' },
  { id: 'esmeralda', name: 'Esmeralda', cost: 4, traits: ['Dauntless', 'Heartbond'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/8/88/Hero811-icon.png' },
  { id: 'ruby', name: 'Ruby', cost: 5, traits: ['Dauntless', 'Exorcist'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/1/1d/Hero291-icon.png' },
  { id: 'barats', name: 'Barats', cost: 4, traits: ['Dauntless', 'Toy Mischief'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/1/1a/Hero991-icon.png' },
  { id: 'silvanna', name: 'Silvanna', cost: 1, traits: ['Dauntless', 'Mystic Meow'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/4/40/Hero901-icon.png' },

  // --- WEAPON MASTER ---
  { id: 'benedetta', name: 'Benedetta', cost: 5, traits: ['Weapon Master', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/4/47/Hero971-icon.png' },
  { id: 'alucard', name: 'Alucard', cost: 1, traits: ['Weapon Master', 'Soul Vessels'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/c/c7/Hero071-icon.png' },
  { id: 'cici', name: 'Cici', cost: 2, traits: ['Weapon Master', 'Heartbond'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/6/65/Hero1231-icon.png' },
  { id: 'fredrinn', name: 'Fredrinn', cost: 3, traits: ['Weapon Master', 'Exorcist'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/f/f4/Hero1171-icon.png' },
  { id: 'aulus', name: 'Aulus', cost: 3, traits: ['Weapon Master', 'Neobeasts'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/b/bf/Hero1081-icon.png' },
  { id: 'roger', name: 'Roger', cost: 4, traits: ['Weapon Master', 'Glory League'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/9/97/Hero391-icon.png' },

  // --- MARKSMAN ---
  { id: 'hanabi', name: 'Hanabi', cost: 4, traits: ['Marksman', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/f/ff/Hero601-icon.png' },
  { id: 'miya', name: 'Miya', cost: 3, traits: ['Marksman', 'Soul Vessels'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/8/8c/Hero011-icon.png' },
  { id: 'granger', name: 'Granger', cost: 2, traits: ['Marksman', 'Luminexus'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/7/7c/Hero791-icon.png' },
  { id: 'brody', name: 'Brody', cost: 1, traits: ['Marksman', 'Exorcist'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/1/12/Hero1001-icon.png' },
  { id: 'beatrix', name: 'Beatrix', cost: 2, traits: ['Marksman', 'Glory League'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/a/a9/Hero1051-icon.png' },
  { id: 'lesley', name: 'Lesley', cost: 5, traits: ['Marksman', 'Mystic Meow'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/8/82/Hero531-icon.png' },

  // --- STARGAZER ---
  { id: 'aurora', name: 'Aurora', cost: 1, traits: ['Stargazer', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/2/2c/Hero361-icon.png' },
  { id: 'odette', name: 'Odette', cost: 2, traits: ['Stargazer', 'Heartbond'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/a/a9/Hero461-icon.png' },
  { id: 'rafaela', name: 'Rafaela', cost: 5, traits: ['Stargazer', 'Luminexus'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/5/5e/Hero141-icon.png' },
  { id: 'pharsa', name: 'Pharsa', cost: 4, traits: ['Stargazer', 'Neobeasts'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/e/ef/Hero521-icon.png' },
  { id: 'cyclops', name: 'Cyclops', cost: 4, traits: ['Stargazer', 'Toy Mischief'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/9/96/Hero331-icon.png' },
  { id: 'xavier', name: 'Xavier', cost: 3, traits: ['Stargazer', 'Beyond The Clouds'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/8/80/Hero1151-icon.png' },

  // --- SWIFTBLADE ---
  { id: 'gusion', name: 'Gusion', cost: 4, traits: ['Swiftblade', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/9/94/Hero561-icon.png' },
  { id: 'aamon', name: 'Aamon', cost: 2, traits: ['Swiftblade', 'Soul Vessels'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/b/bc/Hero1091-icon.png' },
  { id: 'nolan', name: 'Nolan', cost: 1, traits: ['Swiftblade', 'Luminexus'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/e/e1/Hero1221-icon.png' },
  { id: 'saber', name: 'Saber', cost: 3, traits: ['Swiftblade', 'Exorcist'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/8/87/Hero031-icon.png' },
  { id: 'ling', name: 'Ling', cost: 5, traits: ['Swiftblade', 'Neobeasts'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/c/ca/Hero841-icon.png' },
  { id: 'natalia', name: 'Natalia', cost: 2, traits: ['Swiftblade', 'Beyond The Clouds'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/6/6a/Hero241-icon.png' },

  // --- MAGE ---
  { id: 'valir', name: 'Valir', cost: 5, traits: ['Mage', 'Mortal Rival', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/6/60/Hero571-icon.png' },
  { id: 'cecilion', name: 'Cecilion', cost: 1, traits: ['Mage', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/8/85/Hero911-icon.png' },
  { id: 'valentina', name: 'Valentina', cost: 4, traits: ['Mage', 'Luminexus'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/6/62/Hero1101-icon.png' },
  { id: 'lylia', name: 'Lylia', cost: 2, traits: ['Mage', 'Exorcist'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/a/a4/Hero861-icon.png' },
  { id: 'harith', name: 'Harith', cost: 3, traits: ['Mage', 'Neobeasts'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/5/5a/Hero731-icon.png' },
  { id: 'julian', name: 'Julian', cost: 3, traits: ['Mage', 'Phasewarper', 'Mystic Meow'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/c/c2/Hero1161-icon.png' },

  // --- PHASEWARPER ---
  { id: 'clint', name: 'Clint', cost: 2, traits: ['Phasewarper', 'Soul Vessels'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/7/73/Hero131-icon.png' },
  { id: 'lancelot', name: 'Lancelot', cost: 5, traits: ['Phasewarper', 'Heartbond'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/2/29/Hero471-icon.png' },
  { id: 'hayabusa', name: 'Hayabusa', cost: 4, traits: ['Phasewarper', 'Exorcist'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/c/cb/Hero211-icon.png' },

  // --- SCAVENGER ---
  { id: 'karina', name: 'Karina', cost: 3, traits: ['Scavenger', 'K.O.F'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/8/8a/Hero081-icon.png' },
  { id: 'floryn', name: 'Floryn', cost: 4, traits: ['Scavenger', 'Luminexus'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/2/20/Hero1121-icon.png' },
  { id: 'phoveus', name: 'Phoveus', cost: 1, traits: ['Scavenger', 'Exorcist'], img: 'https://static.wikia.nocookie.net/mobile-legends/images/8/88/Hero1061-icon.png' }
];

// --- THRESHOLDS ---
export const SYNERGY_THRESHOLDS = {
  // ROLES
  'Bruiser': [2, 4, 6],
  'Defender': [2, 4, 6],
  'Dauntless': [2, 4, 6],
  'Weapon Master': [2, 4, 6],
  'Marksman': [2, 4, 6],
  'Stargazer': [2, 4, 6],
  'Swiftblade': [2, 4, 6],
  'Mage': [2, 4, 6],
  'Phasewarper': [2, 4],
  'Scavenger': [2, 4],

  // FACTIONS
  'Mortal Rival': [1, 2],
  'K.O.F': [2, 4, 6, 8, 11],
  'Soul Vessels': [2, 4, 6, 10],
  'Heartbond': [2, 4, 6, 10],
  'Luminexus': [2, 4, 6, 10],
  'Exorcist': [2, 4, 6, 10],
  'Neobeasts': [2, 4, 6],
  'Toy Mischief': [2, 4, 6],
  'Glory League': [2, 4, 6],
  'Mystic Meow': [2, 3],
  'Beyond The Clouds': [2, 3]
};

// --- GLORY LEAGUE IDS ---
export const GL_1G_IDS = ['jawhead', 'alucard', 'brody', 'aurora', 'nolan', 'cecilion', 'silvanna', 'phoveus'];
export const GL_5G_IDS = ['chou', 'edith', 'ruby', 'benedetta', 'lesley', 'rafaela', 'ling', 'valir', 'lancelot'];

export const EQUIP_POOL = [
  {
    id: 'malefic_gun',
    name: 'Malefic Gun',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/7/72/Malefic_Gun.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'great_dragon_spear',
    name: 'Great Dragon Spear',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/d/d4/Great_Dragon_Spear.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'sea_halberd',
    name: 'Sea Halberd',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/8/83/Sea_Halberd.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'rose_gold_meteor',
    name: 'Rose Gold Meteor',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/2/2b/Rose_Gold_Meteor.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'hunter_strike',
    name: 'Hunter Strike',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/b/b9/Hunter_Strike.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'blade_of_despair',
    name: 'Blade of Despair',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/d/d5/Blade_of_Despair.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'blade_of_the_heptaseas',
    name: 'Blade of the Heptaseas',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/e/ed/Blade_of_the_Heptaseas.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'windtalker',
    name: 'Windtalker',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/45/Windtalker.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'endless_battle',
    name: 'Endless Battle',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/2/2b/Endless_Battle.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'berserkers_fury',
    name: 'Berserker\'s Fury',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/6/6c/Berserker%27s_Fury.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'haas_claws',
    name: 'Haas\' Claws',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/f/fd/Haas%27_Claws.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'malefic_roar',
    name: 'Malefic Roar',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/12/Malefic_Roar.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'winter_crown',
    name: 'Winter Crown',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/9/9d/Winter_Crown.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'fleeting_time',
    name: 'Fleeting Time',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/7/71/Fleeting_Time.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'sky_piercer',
    name: 'Sky Piercer',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/4f/Sky_Piercer.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'war_axe',
    name: 'War Axe',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/7/70/War_Axe.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'wind_of_nature',
    name: 'Wind of Nature',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/e/e3/Wind_of_Nature.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'golden_staff',
    name: 'Golden Staff',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/8/80/Golden_Staff.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'corrosion_scythe',
    name: 'Corrosion Scythe',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/f/f3/Corrosion_Scythe.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'demon_hunter_sword',
    name: 'Demon Hunter Sword',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/1a/Demon_Hunter_Sword.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'swift_crossbow',
    name: 'Swift Crossbow',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/a/a1/Swift_Crossbow.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'magic_blade',
    name: 'Magic Blade',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/a/ae/Magic_Blade.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'fury_hammer',
    name: 'Fury Hammer',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/5/52/Fury_Hammer.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'rogue_meteor',
    name: 'Rogue Meteor',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/7/75/Rogue_Meteor.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'ogre_tomahawk',
    name: 'Ogre Tomahawk',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/3/3d/Ogre_Tomahawk.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'legion_sword',
    name: 'Legion Sword',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/1e/Legion_Sword.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'regular_spear',
    name: 'Regular Spear',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/3/32/Regular_Spear.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'expert_gloves',
    name: 'Expert Gloves',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/13/Expert_Gloves.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'iron_hunting_bow',
    name: 'Iron Hunting Bow',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/b/be/Iron_Hunting_Bow.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'vampire_mallet',
    name: 'Vampire Mallet',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/f/f9/Vampire_Mallet.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'javelin',
    name: 'Javelin',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/1d/Javelin.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'knife',
    name: 'Knife',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/5/58/Knife.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'dagger',
    name: 'Dagger',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/45/Dagger.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'power_potion',
    name: 'Power Potion',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/0/06/Power_Potion.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'wishing_lantern',
    name: 'Wishing Lantern',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/0/07/Wishing_Lantern.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'flask_of_the_oasis',
    name: 'Flask of the Oasis',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/c/c5/Flask_of_the_Oasis.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'genius_wand',
    name: 'Genius Wand',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/2/20/Genius_Wand.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'lightning_truncheon',
    name: 'Lightning Truncheon',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/e/ee/Lightning_Truncheon.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'blood_wings',
    name: 'Blood Wings',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/44/Blood_Wings.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'starlium_scythe',
    name: 'Starlium Scythe',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/2/26/Starlium_Scythe.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'glowing_wand',
    name: 'Glowing Wand',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/7/7a/Glowing_Wand.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'ice_queen_wand',
    name: 'Ice Queen Wand',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/d/da/Ice_Queen_Wand.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'concentrated_energy',
    name: 'Concentrated Energy',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/4e/Concentrated_Energy.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'holy_crystal',
    name: 'Holy Crystal',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/6/64/Holy_Crystal.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'divine_glaive',
    name: 'Divine Glaive',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/9/9a/Divine_Glaive.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'clock_of_destiny',
    name: 'Clock of Destiny',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/4a/Clock_of_Destiny.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'feather_of_heaven',
    name: 'Feather of Heaven',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/e/ed/Feather_of_Heaven.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'enchanted_talisman',
    name: 'Enchanted Talisman',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/2/21/Enchanted_Talisman.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'elegant_gem',
    name: 'Elegant Gem',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/d/d4/Elegant_Gem.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'exotic_veil',
    name: 'Exotic Veil',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/e/e9/Exotic_Veil.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'azure_blade',
    name: 'Azure Blade',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/6/6d/Azure_Blade.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'tome_of_evil',
    name: 'Tome of Evil',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/0/0a/Tome_of_Evil.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'magic_wand',
    name: 'Magic Wand',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/b/bc/Magic_Wand.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'mystic_container',
    name: 'Mystic Container',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/2/23/Mystic_Container.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'book_of_sages',
    name: 'Book of Sages',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/3/35/Book_of_Sages.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'magic_necklace',
    name: 'Magic Necklace',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/c/cd/Magic_Necklace.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'power_crystal',
    name: 'Power Crystal',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/f/fd/Power_Crystal.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'mystery_codex',
    name: 'Mystery Codex',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/2/2c/Mystery_Codex.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'lantern_of_hope',
    name: 'Lantern of Hope',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/7/79/Lantern_of_Hope.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'flower_of_hope',
    name: 'Flower of Hope',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/2/20/Flower_of_Hope.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'magic_potion',
    name: 'Magic Potion',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/5/58/Magic_Potion.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'radiant_armor',
    name: 'Radiant Armor',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/d/d8/Radiant_Armor.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'chastise_pauldron',
    name: 'Chastise Pauldron',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/2/2f/Chastise_Pauldron.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'brute_force_breastplate',
    name: 'Brute Force Breastplate',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/f/f6/Brute_Force_Breastplate.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'immortality',
    name: 'Immortality',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/8/84/Immortality.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'dominance_ice',
    name: 'Dominance Ice',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/e/e3/Dominance_Ice.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'athenas_shield',
    name: 'Athena\'s Shield',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/15/Athena%27s_Shield.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'oracle',
    name: 'Oracle',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/17/Oracle.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'antique_cuirass',
    name: 'Antique Cuirass',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/40/Antique_Cuirass.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'guardian_helmet',
    name: 'Guardian Helmet',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/a/a3/Guardian_Helmet.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'cursed_helmet',
    name: 'Cursed Helmet',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/8/80/Cursed_Helmet.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'thunder_belt',
    name: 'Thunder Belt',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/d/dd/Thunder_Belt.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'queens_wings',
    name: 'Queen\'s Wings',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/f/f4/Queen%27s_Wings.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'blade_armor',
    name: 'Blade Armor',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/d/d9/Blade_Armor.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'steel_legplates',
    name: 'Steel Legplates',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/3/3c/Steel_Legplates.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'dreadnaught_armor',
    name: 'Dreadnaught Armor',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/0/0f/Dreadnaught_Armor.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'black_ice_shield',
    name: 'Black Ice Shield',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/5/5d/Black_Ice_Shield.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'silence_robe',
    name: 'Silence Robe',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/a/a4/Silence_Robe.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'molten_essence',
    name: 'Molten Essence',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/8/8c/Molten_Essence.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'ares_belt',
    name: 'Ares Belt',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/0/04/Ares_Belt.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'heros_ring',
    name: 'Hero\'s Ring',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/9/91/Hero%27s_Ring.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'healing_necklace',
    name: 'Healing Necklace',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/d/d7/Healing_Necklace.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'magic_resist_cloak',
    name: 'Magic Resist Cloak',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/4c/Magic_Resist_Cloak.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'leather_jerkin',
    name: 'Leather Jerkin',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/5/58/Leather_Jerkin.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'vitality_crystal',
    name: 'Vitality Crystal',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/e/ea/Vitality_Crystal.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'rock_potion',
    name: 'Rock Potion',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/0/03/Rock_Potion.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'demon_shoes',
    name: 'Demon Shoes',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/17/Demon_Shoes.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'rapid_boots',
    name: 'Rapid Boots',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/a/a4/Rapid_Boots.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'swift_boots',
    name: 'Swift Boots',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/0/07/Swift_Boots.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'arcane_boots',
    name: 'Arcane Boots',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/15/Arcane_Boots.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'magic_shoes',
    name: 'Magic Shoes',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/5/5a/Magic_Shoes.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'tough_boots',
    name: 'Tough Boots',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/8/89/Tough_Boots.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'warrior_boots',
    name: 'Warrior Boots',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/4b/Warrior_Boots.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'boots',
    name: 'Boots',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/5/59/Boots.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'allow_throw',
    name: 'Allow Throw',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/1/16/Allow_Throw.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'throw_forbidden',
    name: 'Throw Forbidden',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/7/70/Throw_Forbidden.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'broken_heart',
    name: 'Broken Heart',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/5/56/Broken_Heart.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'resonating_heart',
    name: 'Resonating Heart',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/7/73/Resonating_Heart.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'flame_retribution',
    name: 'Flame Retribution',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/9/9f/Flame_Retribution.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'ice_retribution',
    name: 'Ice Retribution',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/b/bd/Ice_Retribution.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'bloody_retribution',
    name: 'Bloody Retribution',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/4/4c/Bloody_Retribution.png',
    desc: 'Deskripsi item...'
  },
  {
    id: 'active_conceal',
    name: 'Active - Conceal',
    icon: 'https://static.wikia.nocookie.net/mobile-legends/images/e/e0/Active_-_Conceal.png',
    desc: 'Deskripsi item...'
  }
];

// --- RECOMMENDATION ENGINE ---
export function getEquipRecs(traits) {
  const isPhys = traits.some(t => ['Weapon Master', 'Marksman', 'Swiftblade', 'Bruiser', 'Dauntless'].includes(t));
  const isMage = traits.some(t => ['Mage', 'Stargazer', 'Exorcist'].includes(t));
  const isTank = traits.some(t => ['Defender', 'Neobeasts'].includes(t));
  const isASPD = traits.some(t => ['Marksman'].includes(t));

  const items = [];
  
  if (isASPD) {
    items.push(EQUIP_POOL.find(e => e.id === 'demon_hunter_sword'));
    items.push(EQUIP_POOL.find(e => e.id === 'golden_staff'));
    items.push(EQUIP_POOL.find(e => e.id === 'blade_of_despair'));
  } else if (isPhys && !isTank) {
    // Bloodlust Axe diganti jadi War Axe karena Bloodlust udah gak ada di Wiki
    items.push(EQUIP_POOL.find(e => e.id === 'war_axe')); 
    items.push(EQUIP_POOL.find(e => e.id === 'blade_of_despair'));
    items.push(EQUIP_POOL.find(e => e.id === 'immortality'));
  } else if (isMage) {
    items.push(EQUIP_POOL.find(e => e.id === 'enchanted_talisman'));
    items.push(EQUIP_POOL.find(e => e.id === 'glowing_wand'));
    items.push(EQUIP_POOL.find(e => e.id === 'holy_crystal'));
  } else if (isTank) {
    items.push(EQUIP_POOL.find(e => e.id === 'dominance_ice'));
    items.push(EQUIP_POOL.find(e => e.id === 'antique_cuirass'));
    items.push(EQUIP_POOL.find(e => e.id === 'athenas_shield'));
  } else {
    items.push(EQUIP_POOL.find(e => e.id === 'immortality'));
    items.push(EQUIP_POOL.find(e => e.id === 'blade_of_despair'));
    items.push(EQUIP_POOL.find(e => e.id === 'holy_crystal'));
  }
  
  // TAMENG ANTI-ERROR: filter(Boolean) otomatis membuang item yang 'undefined'
  return items.filter(Boolean).slice(0, 3);
}