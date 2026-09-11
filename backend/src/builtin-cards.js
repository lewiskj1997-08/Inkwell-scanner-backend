// Built-in fallback card data. Used only when no catalog JSON (bundled or from the
// ML service) is available at boot. Kept separate so both the auto-seed path
// (src/catalog.js) and the CLI seed script can reference it.
//
// This is intentionally a small representative subset; the full 155-card catalog
// ships as data/cards_db.json and is preferred when present.

const CARD_DATA = [
  // The First Chapter (TFC) - Aug 2023 - 204 cards total
  { card_name: 'Mickey Mouse - Brave Little Tailor', set_name: 'The First Chapter', set_code: 'TFC', set_number: '1', card_type: 'Character', ink_cost: 3, rarity: 'Super Rare', ink_color: 'Ruby', tags: 'character,ruby,super-rare' },
  { card_name: 'Elsa - Spirit of Winter', set_name: 'The First Chapter', set_code: 'TFC', set_number: '2', card_type: 'Character', ink_cost: 4, rarity: 'Legendary', ink_color: 'Sapphire', tags: 'character,sapphire,legendary' },
  { card_name: 'Aladdin - Heroic Outcast', set_name: 'The First Chapter', set_code: 'TFC', set_number: '3', card_type: 'Character', ink_cost: 5, rarity: 'Super Rare', ink_color: 'Ruby', tags: 'character,ruby,super-rare' },
  { card_name: 'Moana - Born Leader', set_name: 'The First Chapter', set_code: 'TFC', set_number: '4', card_type: 'Character', ink_cost: 4, rarity: 'Rare', ink_color: 'Amber', tags: 'character,amber,rare' },
  { card_name: 'Stitch - New Dog', set_name: 'The First Chapter', set_code: 'TFC', set_number: '5', card_type: 'Character', ink_cost: 2, rarity: 'Uncommon', ink_color: 'Amethyst', tags: 'character,amethyst,uncommon' },
  { card_name: 'Maleficent - Monstrous Dragon', set_name: 'The First Chapter', set_code: 'TFC', set_number: '6', card_type: 'Character', ink_cost: 7, rarity: 'Legendary', ink_color: 'Amethyst', tags: 'character,amethyst,legendary' },
  { card_name: 'Captain Hook - Forceful Duelist', set_name: 'The First Chapter', set_code: 'TFC', set_number: '7', card_type: 'Character', ink_cost: 3, rarity: 'Rare', ink_color: 'Emerald', tags: 'character,emerald,rare' },
  { card_name: 'Simba - Future King', set_name: 'The First Chapter', set_code: 'TFC', set_number: '8', card_type: 'Character', ink_cost: 2, rarity: 'Common', ink_color: 'Amber', tags: 'character,amber,common' },
  { card_name: 'A Whole New World', set_name: 'The First Chapter', set_code: 'TFC', set_number: '9', card_type: 'Action', ink_cost: 5, rarity: 'Super Rare', ink_color: 'Amethyst', tags: 'action,amethyst,super-rare' },
  { card_name: 'Be Prepared', set_name: 'The First Chapter', set_code: 'TFC', set_number: '10', card_type: 'Action', ink_cost: 7, rarity: 'Rare', ink_color: 'Ruby', tags: 'action,ruby,rare' },

  // Rise of the Floodborn (ROF) - Nov 2023 - 204 cards
  { card_name: 'Mickey Mouse - Detective', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '1', card_type: 'Character', ink_cost: 3, rarity: 'Super Rare', ink_color: 'Sapphire', tags: 'character,sapphire,super-rare' },
  { card_name: 'Cinderella - Stouthearted', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '2', card_type: 'Character', ink_cost: 4, rarity: 'Legendary', ink_color: 'Amber', tags: 'character,amber,legendary' },
  { card_name: 'Prince John - Phony King', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '3', card_type: 'Character', ink_cost: 4, rarity: 'Super Rare', ink_color: 'Emerald', tags: 'character,emerald,super-rare' },
  { card_name: 'Gaston - Arrogant Hunter', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '4', card_type: 'Character', ink_cost: 3, rarity: 'Rare', ink_color: 'Ruby', tags: 'character,ruby,rare' },
  { card_name: 'Peter Pan - Shadow Finder', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '5', card_type: 'Character', ink_cost: 2, rarity: 'Uncommon', ink_color: 'Ruby', tags: 'character,ruby,uncommon' },
  { card_name: 'Ursula - Deceiver', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '6', card_type: 'Character', ink_cost: 5, rarity: 'Legendary', ink_color: 'Amethyst', tags: 'character,amethyst,legendary' },
  { card_name: 'Wendy - Darling', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '7', card_type: 'Character', ink_cost: 2, rarity: 'Common', ink_color: 'Amber', tags: 'character,amber,common' },
  { card_name: 'Smee - Bumbling Mate', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '8', card_type: 'Character', ink_cost: 1, rarity: 'Common', ink_color: 'Emerald', tags: 'character,emerald,common' },
  { card_name: 'Friends on the Other Side', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '9', card_type: 'Action', ink_cost: 4, rarity: 'Rare', ink_color: 'Amethyst', tags: 'action,amethyst,rare' },
  { card_name: 'Grimmsnapper', set_name: 'Rise of the Floodborn', set_code: 'ROF', set_number: '10', card_type: 'Action', ink_cost: 5, rarity: 'Uncommon', ink_color: 'Emerald', tags: 'action,emerald,uncommon' },

  // Into the Inklands (ITI) - Feb 2024 - 204 cards
  { card_name: 'Chernabog - Evildoer', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '1', card_type: 'Character', ink_cost: 6, rarity: 'Legendary', ink_color: 'Amethyst', tags: 'character,amethyst,legendary' },
  { card_name: 'Pegasus - Flying Steed', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '2', card_type: 'Character', ink_cost: 3, rarity: 'Rare', ink_color: 'Sapphire', tags: 'character,sapphire,rare' },
  { card_name: 'Daisy Duck - Donald\'s Date', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '3', card_type: 'Character', ink_cost: 2, rarity: 'Common', ink_color: 'Amber', tags: 'character,amber,common' },
  { card_name: 'Scrooge McDuck - Richest Duck', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '4', card_type: 'Character', ink_cost: 4, rarity: 'Super Rare', ink_color: 'Sapphire', tags: 'character,sapphire,super-rare' },
  { card_name: 'Huey Duck - Clever Nephew', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '5', card_type: 'Character', ink_cost: 1, rarity: 'Common', ink_color: 'Amethyst', tags: 'character,amethyst,common' },
  { card_name: 'Launchpad McQuack - Crash Test Pilot', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '6', card_type: 'Character', ink_cost: 3, rarity: 'Uncommon', ink_color: 'Ruby', tags: 'character,ruby,uncommon' },
  { card_name: 'Magica De Spell - Ambitious Sorceress', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '7', card_type: 'Character', ink_cost: 5, rarity: 'Legendary', ink_color: 'Amethyst', tags: 'character,amethyst,legendary' },
  { card_name: 'Flintheart Glomgold - Second Richest Duck', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '8', card_type: 'Character', ink_cost: 4, rarity: 'Rare', ink_color: 'Emerald', tags: 'character,emerald,rare' },
  { card_name: 'The Beagle Boys - Bumbling Brothers', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '9', card_type: 'Character', ink_cost: 2, rarity: 'Uncommon', ink_color: 'Ruby', tags: 'character,ruby,uncommon' },
  { card_name: 'Gyro Gearloose - Brilliant Inventor', set_name: 'Into the Inklands', set_code: 'ITI', set_number: '10', card_type: 'Character', ink_cost: 3, rarity: 'Rare', ink_color: 'Sapphire', tags: 'character,sapphire,rare' },

  // Ursula's Return (UR) - May 2024 - 204 cards
  { card_name: 'Ursula - Sea Witch Queen', set_name: "Ursula's Return", set_code: 'UR', set_number: '1', card_type: 'Character', ink_cost: 6, rarity: 'Legendary', ink_color: 'Amethyst', tags: 'character,amethyst,legendary' },
  { card_name: 'Ariel - On Her Feet', set_name: "Ursula's Return", set_code: 'UR', set_number: '2', card_type: 'Character', ink_cost: 4, rarity: 'Super Rare', ink_color: 'Amber', tags: 'character,amber,super-rare' },
  { card_name: 'Prince Eric - Dashing', set_name: "Ursula's Return", set_code: 'UR', set_number: '3', card_type: 'Character', ink_cost: 3, rarity: 'Rare', ink_color: 'Sapphire', tags: 'character,sapphire,rare' },
  { card_name: 'Sebastian - Court Composer', set_name: "Ursula's Return", set_code: 'UR', set_number: '4', card_type: 'Character', ink_cost: 2, rarity: 'Uncommon', ink_color: 'Ruby', tags: 'character,ruby,uncommon' },
  { card_name: 'Flounder - Always Worried', set_name: "Ursula's Return", set_code: 'UR', set_number: '5', card_type: 'Character', ink_cost: 1, rarity: 'Common', ink_color: 'Sapphire', tags: 'character,sapphire,common' },
  { card_name: 'King Triton - Ruler of Atlantica', set_name: "Ursula's Return", set_code: 'UR', set_number: '6', card_type: 'Character', ink_cost: 5, rarity: 'Super Rare', ink_color: 'Sapphire', tags: 'character,sapphire,super-rare' },
  { card_name: 'Vanessa - Ursula\'s Disguise', set_name: "Ursula's Return", set_code: 'UR', set_number: '7', card_type: 'Character', ink_cost: 3, rarity: 'Rare', ink_color: 'Amethyst', tags: 'character,amethyst,rare' },
  { card_name: 'Scuttle - Know-It-All', set_name: "Ursula's Return", set_code: 'UR', set_number: '8', card_type: 'Character', ink_cost: 2, rarity: 'Common', ink_color: 'Emerald', tags: 'character,emerald,common' },
  { card_name: 'Part of Your World', set_name: "Ursula's Return", set_code: 'UR', set_number: '9', card_type: 'Action', ink_cost: 3, rarity: 'Rare', ink_color: 'Sapphire', tags: 'action,sapphire,rare' },
  { card_name: 'Poor Unfortunate Souls', set_name: "Ursula's Return", set_code: 'UR', set_number: '10', card_type: 'Action', ink_cost: 5, rarity: 'Super Rare', ink_color: 'Amethyst', tags: 'action,amethyst,super-rare' },

  // Shimmering Skies (SS) - Aug 2024 - 204 cards
  { card_name: 'Tinker Bell - Light Bringer', set_name: 'Shimmering Skies', set_code: 'SS', set_number: '1', card_type: 'Character', ink_cost: 3, rarity: 'Super Rare', ink_color: 'Amethyst', tags: 'character,amethyst,super-rare' },
  { card_name: 'Raya - Heart of Kumandra', set_name: 'Shimmering Skies', set_code: 'SS', set_number: '2', card_type: 'Character', ink_cost: 4, rarity: 'Legendary', ink_color: 'Ruby', tags: 'character,ruby,legendary' },
  { card_name: 'Drake - Ever After', set_name: 'Shimmering Skies', set_code: 'SS', set_number: '3', card_type: 'Character', ink_cost: 2, rarity: 'Rare', ink_color: 'Amber', tags: 'character,amber,rare' },
  { card_name: 'Sisu - Water Dragon', set_name: 'Shimmering Skies', set_code: 'SS', set_number: '4', card_type: 'Character', ink_cost: 5, rarity: 'Legendary', ink_color: 'Sapphire', tags: 'character,sapphire,legendary' },
  { card_name: 'Namaari - Conflicted', set_name: 'Shimmering Skies', set_code: 'SS', set_number: '5', card_type: 'Character', ink_cost: 3, rarity: 'Rare', ink_color: 'Emerald', tags: 'character,emerald,rare' },

  // Azurite Sea (AS) - Nov 2024 - 204 cards
  { card_name: 'Donald Duck - Daring Deckhand', set_name: 'Azurite Sea', set_code: 'AS', set_number: '1', card_type: 'Character', ink_cost: 3, rarity: 'Super Rare', ink_color: 'Ruby', tags: 'character,ruby,super-rare' },
  { card_name: 'Goofy - Adventurous', set_name: 'Azurite Sea', set_code: 'AS', set_number: '2', card_type: 'Character', ink_cost: 4, rarity: 'Legendary', ink_color: 'Sapphire', tags: 'character,sapphire,legendary' },
  { card_name: 'Minnie Mouse - Captain', set_name: 'Azurite Sea', set_code: 'AS', set_number: '3', card_type: 'Character', ink_cost: 3, rarity: 'Rare', ink_color: 'Amber', tags: 'character,amber,rare' },
  { card_name: 'Pluto - First Mate', set_name: 'Azurite Sea', set_code: 'AS', set_number: '4', card_type: 'Character', ink_cost: 2, rarity: 'Common', ink_color: 'Amber', tags: 'character,amber,common' },
  { card_name: 'Davy Jones - Locker Keeper', set_name: 'Azurite Sea', set_code: 'AS', set_number: '5', card_type: 'Character', ink_cost: 6, rarity: 'Legendary', ink_color: 'Amethyst', tags: 'character,amethyst,legendary' },

  // Archazia's Island (AI) - Mar 2025 - 204 cards
  { card_name: 'Archazia - Ancient Guardian', set_name: "Archazia's Island", set_code: 'AI', set_number: '1', card_type: 'Character', ink_cost: 5, rarity: 'Legendary', ink_color: 'Sapphire', tags: 'character,sapphire,legendary' },
  { card_name: 'Panchito - Shotgun', set_name: "Archazia's Island", set_code: 'AI', set_number: '2', card_type: 'Character', ink_cost: 3, rarity: 'Uncommon', ink_color: 'Ruby', tags: 'character,ruby,uncommon' },
  { card_name: 'Jose Carioca - Brazil', set_name: "Archazia's Island", set_code: 'AI', set_number: '3', card_type: 'Character', ink_cost: 3, rarity: 'Uncommon', ink_color: 'Emerald', tags: 'character,emerald,uncommon' },
  { card_name: 'Chip - Rescue Ranger', set_name: "Archazia's Island", set_code: 'AI', set_number: '4', card_type: 'Character', ink_cost: 2, rarity: 'Common', ink_color: 'Ruby', tags: 'character,ruby,common' },
  { card_name: 'Dale - Rescue Ranger', set_name: "Archazia's Island", set_code: 'AI', set_number: '5', card_type: 'Character', ink_cost: 2, rarity: 'Common', ink_color: 'Amber', tags: 'character,amber,common' },
];

const SET_METADATA = [
  { name: 'The First Chapter', code: 'TFC', release_date: '2023-08-18', total_cards: 204 },
  { name: 'Rise of the Floodborn', code: 'ROF', release_date: '2023-11-17', total_cards: 204 },
  { name: 'Into the Inklands', code: 'ITI', release_date: '2024-02-23', total_cards: 204 },
  { name: "Ursula's Return", code: 'UR', release_date: '2024-05-17', total_cards: 204 },
  { name: 'Shimmering Skies', code: 'SS', release_date: '2024-08-09', total_cards: 204 },
  { name: 'Azurite Sea', code: 'AS', release_date: '2024-11-17', total_cards: 204 },
  { name: "Archazia's Island", code: 'AI', release_date: '2025-03-20', total_cards: 204 },
  { name: 'Reign of Jafar', code: 'ROJ', release_date: '2025-05-30', total_cards: 204 },
  { name: 'Fabled', code: 'FAB', release_date: '2025-06-30', total_cards: 204 },
  { name: 'Whispers in the Well', code: 'WITW', release_date: '2025-10-31', total_cards: 204 },
  { name: 'Winterspell', code: 'WS', release_date: '2026-02-19', total_cards: 204 },
  { name: 'Wilds Unknown', code: 'WU', release_date: '2026-05-15', total_cards: 204 },
];

module.exports = { CARD_DATA, SET_METADATA };
