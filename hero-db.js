/**
 * MCGG NETWORK — SHARED HERO DATABASE (ES Module)
 * Season 5: Mystic Meow
 *
 * Single source of truth for hero data. Both builder.js and app.js
 * import from this file — no global variable pollution.
 *
 * Usage:
 *   import { HERO_DB, SYNERGY_THRESHOLDS, getEquipRecs, ... } from './hero-db.js';
 *
 * HTML scripts must use type="module":
 *   <script type="module" src="builder.js"></script>
 */

// ─── EQUIPMENT POOL ────────────────────────────────────────────────────────────
export const EQUIP_POOL = {
  'Immortality':             { icon: '🛡️', desc: 'Revive once with 15% HP' },
  'Antique Cuirass':         { icon: '🪖', desc: '-6% ATK on hit (stacks 3×)' },
  'Cursed Helmet':           { icon: '⛑️', desc: 'Magic damage to nearby enemies' },
  'Warrior Boots':           { icon: '👢', desc: '+22 Physical Defense, +40 Move Spd' },
  'Holy Crystal':            { icon: '🔮', desc: '+100 Magic Power (scales with HP)' },
  'Glowing Wand':            { icon: '✨', desc: 'Burn: 1% HP magic dmg per sec (3s)' },
  'Lightning Truncheon':     { icon: '⚡', desc: 'Lightning bounces for AoE magic dmg' },
  'Concentrated Energy':     { icon: '💠', desc: '+70 Mag Power + life steal 25%' },
  "Berserker's Fury":        { icon: '🗡️', desc: '+65% Crit Dmg on Crit hit' },
  'Wind of Nature':          { icon: '🍃', desc: '2s physical immune active' },
  'Scarlet Phantom':         { icon: '🏹', desc: '+30% AS, +20% Crit Chance' },
  'Demon Hunter Sword':      { icon: '⚔️', desc: '8% current HP as bonus dmg' },
  'Endless Battle':          { icon: '🔥', desc: 'True Dmg after skill use' },
  'Bloodlust Axe':           { icon: '🩸', desc: '+20% Spell Vamp' },
  'Hunter Strike':           { icon: '💢', desc: '-10% Cooldown, chase slow on hit' },
  'Blade of Despair':        { icon: '🌑', desc: '+160 Phys Atk vs low-HP enemies' },
  'Malefic Roar':            { icon: '💀', desc: '+60% Phys Penetration' },
  "Haa's Claws":             { icon: '🦅', desc: '+70 Phys Atk, +20% Physical Lifesteal' },
  'Oracle':                  { icon: '🌙', desc: '+42 Magic Def, boosts shields & regen' },
  'Necklace of Durance':     { icon: '📿', desc: 'Reduces enemy regen by 50%' },
  'Fleeting Time':           { icon: '⏳', desc: '-30% Ult CDR on assist/kill' },
  'Dominance Ice':           { icon: '🧊', desc: '-10% AS & move spd to nearby enemies' },
  'Brute Force Breastplate': { icon: '🔵', desc: 'Move Spd +2% per skill/basic (5 stacks)' },
  'Blade of Heptaseas':      { icon: '🌀', desc: '+70 Phys Atk burst on first hit' },
  'Calamity Reaper':         { icon: '🌪️', desc: 'True Dmg next basic after skill' },
};

// ─── EQUIPMENT RECOMMENDATIONS BY TRAIT ────────────────────────────────────────
export const EQUIP_RECS = {
  'Bruiser':           ['Immortality', 'Antique Cuirass', 'Cursed Helmet'],
  'Defender':          ['Dominance Ice', 'Antique Cuirass', 'Brute Force Breastplate'],
  'Dauntless':         ['Immortality', 'Warrior Boots', 'Cursed Helmet'],
  'Weapon Master':     ['Endless Battle', 'Bloodlust Axe', 'Hunter Strike'],
  'Marksman':          ["Berserker's Fury", 'Scarlet Phantom', 'Wind of Nature'],
  'Mage':              ['Holy Crystal', 'Glowing Wand', 'Lightning Truncheon'],
  'Swiftblade':        ['Blade of Despair', 'Malefic Roar', "Haa's Claws"],
  'Phasewarper':       ['Blade of Heptaseas', 'Calamity Reaper', 'Malefic Roar'],
  'Scavenger':         ["Haa's Claws", 'Hunter Strike', 'Blade of Despair'],
  'Stargazer':         ['Oracle', 'Necklace of Durance', 'Fleeting Time'],
  'K.O.F':             ['Endless Battle', 'Bloodlust Axe', 'Immortality'],
  'Soul Vessels':      ['Holy Crystal', 'Concentrated Energy', 'Glowing Wand'],
  'Heartbond':         ['Oracle', 'Fleeting Time', 'Necklace of Durance'],
  'Luminexus':         ['Holy Crystal', 'Glowing Wand', 'Lightning Truncheon'],
  'Exorcist':          ['Bloodlust Axe', 'Hunter Strike', 'Blade of Despair'],
  'Neobeasts':         ['Immortality', 'Endless Battle', 'Antique Cuirass'],
  'Toy Mischief':      ['Calamity Reaper', 'Hunter Strike', 'Endless Battle'],
  'Glory League':      ['Immortality', 'Dominance Ice', 'Antique Cuirass'],
  'Mystic Meow':       ['Holy Crystal', 'Glowing Wand', 'Concentrated Energy'],
  'Beyond The Clouds': ['Dominance Ice', 'Oracle', 'Antique Cuirass'],
  'Mortal Rival':      ['Blade of Despair', 'Malefic Roar', "Haa's Claws"],
};

// ─── SYNERGY ACTIVATION THRESHOLDS ─────────────────────────────────────────────
export const SYNERGY_THRESHOLDS = {
  'K.O.F':             [2, 4, 6, 8, 10],
  'Mortal Rival':      [2],
  'Soul Vessels':      [2, 4, 6],
  'Heartbond':         [2, 4, 6],
  'Luminexus':         [2, 4, 6],
  'Exorcist':          [2, 4, 6],
  'Neobeasts':         [2, 4, 6],
  'Toy Mischief':      [2, 4, 6],
  'Glory League':      [2, 4],
  'Mystic Meow':       [2, 4],
  'Beyond The Clouds': [2, 4],
  'Bruiser':           [2, 4],
  'Defender':          [2, 4],
  'Dauntless':         [2, 4],
  'Weapon Master':     [2, 4],
  'Marksman':          [2, 4],
  'Mage':              [2, 4, 6],
  'Swiftblade':        [2, 4],
  'Phasewarper':       [2, 4],
  'Scavenger':         [2, 4],
  'Stargazer':         [2, 4],
};

// ─── HERO DATABASE (CANONICAL) ──────────────────────────────────────────────────
// - traits[0] is always the faction trait (K.O.F, Soul Vessels, etc.)
// - traits[1+] are role traits
// - img uses DiceBear for placeholder avatars; swap with real assets as needed
export const HERO_DB = [
  // K.O.F
  { id: 'chou',      name: 'Chou',      cost: 5, traits: ['K.O.F', 'Mortal Rival', 'Bruiser'],   img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Chou' },
  { id: 'paquito',   name: 'Paquito',   cost: 4, traits: ['K.O.F', 'Defender'],                  img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Paquito' },
  { id: 'dyrroth',   name: 'Dyrroth',   cost: 2, traits: ['K.O.F', 'Dauntless'],                 img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Dyrroth' },
  { id: 'aurora',    name: 'Aurora',    cost: 1, traits: ['K.O.F', 'Stargazer'],                 img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aurora' },
  { id: 'gusion',    name: 'Gusion',    cost: 4, traits: ['K.O.F', 'Swiftblade'],                img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Gusion' },
  { id: 'valir',     name: 'Valir',     cost: 5, traits: ['K.O.F', 'Mortal Rival', 'Mage'],     img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Valir' },
  { id: 'karina',    name: 'Karina',    cost: 3, traits: ['K.O.F', 'Scavenger'],                 img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Karina' },

  // Soul Vessels
  { id: 'gloo',      name: 'Gloo',      cost: 3, traits: ['Soul Vessels', 'Dauntless'],          img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Gloo' },
  { id: 'benedetta', name: 'Benedetta', cost: 5, traits: ['Soul Vessels', 'Weapon Master'],      img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Benedetta' },
  { id: 'hanabi',    name: 'Hanabi',    cost: 4, traits: ['Soul Vessels', 'Marksman'],           img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Hanabi' },
  { id: 'aamon',     name: 'Aamon',     cost: 2, traits: ['Soul Vessels', 'Swiftblade'],         img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aamon' },
  { id: 'cecilion',  name: 'Cecilion',  cost: 1, traits: ['Soul Vessels', 'Mage'],               img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Cecilion' },
  { id: 'clint',     name: 'Clint',     cost: 2, traits: ['Soul Vessels', 'Phasewarper'],        img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Clint' },

  // Heartbond
  { id: 'khufra',    name: 'Khufra',    cost: 3, traits: ['Heartbond', 'Defender'],              img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Khufra' },
  { id: 'esmeralda', name: 'Esmeralda', cost: 4, traits: ['Heartbond', 'Dauntless'],             img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Esmeralda' },
  { id: 'alucard',   name: 'Alucard',   cost: 1, traits: ['Heartbond', 'Weapon Master'],         img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Alucard' },
  { id: 'miya',      name: 'Miya',      cost: 3, traits: ['Heartbond', 'Marksman'],              img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Miya' },
  { id: 'odette',    name: 'Odette',    cost: 2, traits: ['Heartbond', 'Stargazer'],             img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Odette' },
  { id: 'lancelot',  name: 'Lancelot',  cost: 5, traits: ['Heartbond', 'Phasewarper'],           img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Lancelot' },
  { id: 'masha',     name: 'Masha',     cost: 3, traits: ['Heartbond', 'Bruiser'],               img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Masha' },

  // Luminexus
  { id: 'cici',      name: 'Cici',      cost: 2, traits: ['Luminexus', 'Weapon Master'],         img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Cici' },
  { id: 'rafaela',   name: 'Rafaela',   cost: 5, traits: ['Luminexus', 'Stargazer'],             img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Rafaela' },
  { id: 'nolan',     name: 'Nolan',     cost: 1, traits: ['Luminexus', 'Swiftblade'],            img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Nolan' },
  { id: 'valentina', name: 'Valentina', cost: 4, traits: ['Luminexus', 'Mage'],                  img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Valentina' },
  { id: 'floryn',    name: 'Floryn',    cost: 4, traits: ['Luminexus', 'Scavenger'],             img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Floryn' },

  // Exorcist
  { id: 'yuzhong',   name: 'Yu Zhong',  cost: 4, traits: ['Exorcist', 'Bruiser'],                img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=YuZhong' },
  { id: 'ruby',      name: 'Ruby',      cost: 5, traits: ['Exorcist', 'Dauntless'],              img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Ruby' },
  { id: 'granger',   name: 'Granger',   cost: 2, traits: ['Exorcist', 'Marksman'],               img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Granger' },
  { id: 'saber',     name: 'Saber',     cost: 3, traits: ['Exorcist', 'Swiftblade'],             img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Saber' },
  { id: 'hayabusa',  name: 'Hayabusa',  cost: 4, traits: ['Exorcist', 'Phasewarper'],            img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Hayabusa' },
  { id: 'phoveus',   name: 'Phoveus',   cost: 1, traits: ['Exorcist', 'Scavenger'],              img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Phoveus' },
  { id: 'pharsa',    name: 'Pharsa',    cost: 4, traits: ['Exorcist', 'Stargazer'],              img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Pharsa' },

  // Neobeasts
  { id: 'gatotkaca', name: 'Gatotkaca', cost: 2, traits: ['Neobeasts', 'Bruiser', 'Defender'],  img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Gatotkaca' },
  { id: 'fredrinn',  name: 'Fredrinn',  cost: 3, traits: ['Neobeasts', 'Weapon Master'],         img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Fredrinn' },
  { id: 'brody',     name: 'Brody',     cost: 1, traits: ['Neobeasts', 'Marksman'],              img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Brody' },
  { id: 'ling',      name: 'Ling',      cost: 5, traits: ['Neobeasts', 'Swiftblade'],            img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Ling' },
  { id: 'lylia',     name: 'Lylia',     cost: 2, traits: ['Neobeasts', 'Mage'],                  img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Lylia' },
  { id: 'cyclops',   name: 'Cyclops',   cost: 4, traits: ['Neobeasts', 'Stargazer'],             img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Cyclops' },

  // Toy Mischief
  { id: 'jawhead',   name: 'Jawhead',   cost: 1, traits: ['Toy Mischief', 'Bruiser'],            img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jawhead' },
  { id: 'uranus',    name: 'Uranus',    cost: 2, traits: ['Toy Mischief', 'Defender'],           img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Uranus' },
  { id: 'barats',    name: 'Barats',    cost: 4, traits: ['Toy Mischief', 'Dauntless'],          img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Barats' },
  { id: 'aulus',     name: 'Aulus',     cost: 3, traits: ['Toy Mischief', 'Weapon Master'],      img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aulus' },
  { id: 'cyclops2',  name: 'Cyclops',   cost: 4, traits: ['Toy Mischief', 'Stargazer'],          img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Cyclops2' },
  { id: 'harith',    name: 'Harith',    cost: 3, traits: ['Toy Mischief', 'Mage'],               img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Harith' },

  // Glory League
  { id: 'aldous',    name: 'Aldous',    cost: 2, traits: ['Glory League', 'Bruiser'],            img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Aldous' },
  { id: 'minotaur',  name: 'Minotaur',  cost: 3, traits: ['Glory League', 'Defender'],           img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Minotaur' },
  { id: 'roger',     name: 'Roger',     cost: 4, traits: ['Glory League', 'Weapon Master'],      img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Roger' },
  { id: 'beatrix',   name: 'Beatrix',   cost: 2, traits: ['Glory League', 'Marksman'],           img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Beatrix' },

  // Mystic Meow
  { id: 'lesley',    name: 'Lesley',    cost: 5, traits: ['Mystic Meow', 'Marksman'],            img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Lesley' },
  { id: 'silvanna',  name: 'Silvanna',  cost: 1, traits: ['Mystic Meow', 'Dauntless'],           img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Silvanna' },
  { id: 'julian',    name: 'Julian',    cost: 3, traits: ['Mystic Meow', 'Mage', 'Phasewarper'], img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Julian' },
  { id: 'edith',     name: 'Edith',     cost: 5, traits: ['Mystic Meow', 'Defender'],            img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Edith' },

  // Beyond The Clouds
  { id: 'xavier',    name: 'Xavier',    cost: 3, traits: ['Beyond The Clouds', 'Stargazer'],     img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Xavier' },
  { id: 'natalia',   name: 'Natalia',   cost: 2, traits: ['Beyond The Clouds', 'Swiftblade'],    img: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Natalia' },
];

// ─── GL PRESET LISTS (used by builder dropdowns) ───────────────────────────────
export const GL_1G_IDS = ['aurora', 'silvanna', 'cecilion', 'phoveus', 'nolan'];
export const GL_5G_IDS = ['rafaela', 'ruby', 'ling', 'lancelot'];

// ─── HELPERS ───────────────────────────────────────────────────────────────────
export function getEquipRecs(traits) {
  for (const t of traits) {
    if (EQUIP_RECS[t]) return EQUIP_RECS[t].map(name => ({ name, ...EQUIP_POOL[name] }));
  }
  return ['Immortality', 'Endless Battle', 'Holy Crystal'].map(name => ({ name, ...EQUIP_POOL[name] }));
}