/**
 * Prestige film TMDB IDs — drawn from canonical arthouse lists:
 *   • Sight & Sound Top 250 (2022)
 *   • Cannes Palme d'Or winners
 *   • Venice Golden Lion winners
 *   • Berlin Golden Bear winners
 *   • Criterion Collection / MUBI essentials
 *   • Collider / Guardian / IMDb arthouse picks
 *   • Key works by major arthouse directors
 *
 * Films in this set receive list_count=3 in deck/room builders, triggering
 * the +2 score bonus in the recommender — they surface significantly more often.
 */
export const PRESTIGE_IDS = new Set<number>([

  // ── Cannes Palme d'Or winners ──────────────────────────────────────────
  496243,  // Parasite (2019) — Bong Joon-ho
  527774,  // Shoplifters (2018) — Hirokazu Kore-eda
  422855,  // The Square (2017) — Ruben Östlund
  60308,   // The Tree of Life (2011) — Terrence Malick
  21728,   // The White Ribbon (2009) — Michael Haneke
  13277,   // The Class / Entre les murs (2008) — Laurent Cantet
  12691,   // 4 Months, 3 Weeks and 2 Days (2007) — Cristian Mungiu
  3060,    // Dancer in the Dark (2000) — Lars von Trier
  11553,   // Rosetta (1999) — Dardenne Brothers
  9472,    // The Piano (1993) — Jane Campion
  11072,   // Three Colors: Red (1994) — Krzysztof Kieślowski
  9655,    // Breaking the Waves (1996) — Lars von Trier
  28178,   // Underground (1995) — Emir Kusturica
  680,     // Pulp Fiction (1994) — Quentin Tarantino
  28,      // Apocalypse Now (1979) — Francis Ford Coppola
  820,     // The Conversation (1974) — Francis Ford Coppola
  1340,    // La Dolce Vita (1960) — Federico Fellini
  29907,   // Viridiana (1961) — Luis Buñuel
  20986,   // Mon Oncle (1958) — Jacques Tati
  22554,   // The Leopard (1963) — Luchino Visconti

  // ── Venice Golden Lion winners ─────────────────────────────────────────
  1034041, // Poor Things (2023) — Yorgos Lanthimos
  552688,  // Roma (2018) — Alfonso Cuarón
  581734,  // Nomadland (2020) — Chloé Zhao
  72579,   // A Separation (2011) — Asghar Farhadi
  430,     // Bicycle Thieves (1948) — Vittorio De Sica
  11877,   // Rashomon (1950) — Akira Kurosawa

  // ── Berlin Golden Bear winners ─────────────────────────────────────────
  762504,  // Titane (2021) — Julia Ducournau (Palme)
  432132,  // A Fantastic Woman (2017) — Sebastián Lelio
  103216,  // Amour (2012) — Michael Haneke

  // ── Grand Prix / Jury Prize Cannes ─────────────────────────────────────
  1008042, // The Zone of Interest (2023) — Jonathan Glazer
  654393,  // Triangle of Sadness (2022) — Ruben Östlund
  770245,  // Compartment No. 6 (2021) — Juho Kuosmanen
  736804,  // Drive My Car (2021) — Ryûsuke Hamaguchi
  617258,  // Bacurau (2019) — Kleber Mendonça Filho
  612885,  // Atlantics (2019) — Mati Diop
  195544,  // The Great Beauty (2013) — Paolo Sorrentino
  176042,  // Blue Is the Warmest Color (2013) — Abdellatif Kechiche
  196936,  // Like Father, Like Son (2013) — Hirokazu Kore-eda
  65843,   // Uncle Boonmee Who Can Recall His Past Lives (2010)
  27586,   // A Prophet (2009) — Jacques Audiard
  4586,    // Caché / Hidden (2005) — Michael Haneke
  9298,    // The Child / L'Enfant (2005) — Dardenne Brothers

  // ── Sight & Sound Top 250 / BFI essentials ────────────────────────────
  62,      // 2001: A Space Odyssey (1968) — Stanley Kubrick
  1397,    // 8½ (1963) — Federico Fellini
  346,     // Seven Samurai (1954) — Akira Kurosawa
  11645,   // Ran (1985) — Akira Kurosawa
  10528,   // Persona (1966) — Ingmar Bergman
  10530,   // Cries and Whispers (1972) — Ingmar Bergman
  22502,   // Wild Strawberries (1957) — Ingmar Bergman
  2975,    // Scenes from a Marriage (1973) — Ingmar Bergman
  18717,   // Ordet / The Word (1955) — Carl Theodor Dreyer
  8953,    // Mirror / Zerkalo (1975) — Andrei Tarkovsky
  8062,    // Stalker (1979) — Andrei Tarkovsky
  17517,   // Andrei Rublev (1966) — Andrei Tarkovsky
  10837,   // Nostalghia (1983) — Andrei Tarkovsky
  22183,   // The Sacrifice (1986) — Andrei Tarkovsky
  2990,    // Breathless / À bout de souffle (1960) — Godard
  2649,    // The 400 Blows (1959) — Truffaut
  22285,   // Last Year at Marienbad (1961) — Alain Resnais
  22488,   // Hiroshima Mon Amour (1959) — Alain Resnais
  10054,   // The Discreet Charm of the Bourgeoisie (1972) — Buñuel
  15260,   // The Umbrellas of Cherbourg (1964) — Jacques Demy
  15474,   // Band of Outsiders (1964) — Godard
  6982,    // Amarcord (1973) — Federico Fellini
  10539,   // In the Mood for Love (2000) — Wong Kar-wai
  11622,   // Chungking Express (1994) — Wong Kar-wai
  11514,   // 2046 (2004) — Wong Kar-wai
  16820,   // Yi Yi (2000) — Edward Yang
  11040,   // A Brighter Summer Day (1991) — Edward Yang
  129,     // Spirited Away (2001) — Hayao Miyazaki
  128,     // Princess Mononoke (1997) — Hayao Miyazaki
  8392,    // My Neighbor Totoro (1988) — Hayao Miyazaki
  14700,   // Taste of Cherry (1997) — Abbas Kiarostami
  14916,   // The Wind Will Carry Us (1999) — Abbas Kiarostami
  15340,   // Close-Up (1990) — Abbas Kiarostami
  11374,   // The Double Life of Véronique (1991) — Kieślowski
  11362,   // Three Colors: Blue (1993) — Kieślowski
  26354,   // Dekalog (1988) — Krzysztof Kieślowski
  30498,   // A Short Film About Killing (1988) — Kieślowski
  18917,   // Pickpocket (1959) — Robert Bresson
  12666,   // A Man Escaped (1956) — Robert Bresson
  6972,    // Wings of Desire (1987) — Wim Wenders
  11202,   // Paris, Texas (1984) — Wim Wenders
  11876,   // Fitzcarraldo (1982) — Werner Herzog
  11517,   // Come and See (1985) — Elem Klimov
  33267,   // The Ascent (1977) — Larisa Shepitko
  23649,   // Werckmeister Harmonies (2000) — Béla Tarr
  29833,   // Sátántangó (1994) — Béla Tarr
  19105,   // The Gleaners and I (2000) — Agnès Varda
  21799,   // Sans Soleil (1983) — Chris Marker
  23054,   // The Spirit of the Beehive (1973) — Víctor Erice
  34734,   // Landscape in the Mist (1988) — Theo Angelopoulos
  37285,   // Yol (1982) — Yilmaz Güney
  46120,   // Tampopo (1985) — Juzo Itami
  149,     // Akira (1988) — Katsuhiro Otomo
  398,     // Cinema Paradiso (1988) — Giuseppe Tornatore
  185,     // A Clockwork Orange (1971) — Stanley Kubrick
  15919,   // Barry Lyndon (1975) — Stanley Kubrick
  403,     // Crouching Tiger, Hidden Dragon (2000) — Ang Lee
  3282,    // Last Tango in Paris (1972) — Bernardo Bertolucci
  6984,    // Theorem / Teorema (1968) — Pier Paolo Pasolini

  // ── Contemporary prestige (2015–2024) ─────────────────────────────────
  1084199, // Past Lives (2023) — Celine Song
  1064213, // All of Us Strangers (2023) — Andrew Haigh
  1164707, // Monster (2023) — Hirokazu Kore-eda
  792777,  // Aftersun (2022) — Charlotte Wells
  674324,  // The Banshees of Inisherin (2022) — Martin McDonagh
  811721,  // Holy Spider (2022) — Ali Abbasi
  830082,  // EO (2022) — Jerzy Skolimowski
  774752,  // Tár (2022) — Todd Field
  829280,  // All Quiet on the Western Front (2022) — Edward Berger
  813640,  // Decision to Leave (2022) — Park Chan-wook
  649097,  // The Worst Person in the World (2021) — Joachim Trier
  650871,  // The Power of the Dog (2021) — Jane Campion
  736140,  // A Hero (2021) — Asghar Farhadi
  755566,  // Flee (2021) — Jonas Poher Rasmussen
  710017,  // Quo Vadis, Aida? (2020) — Jasmila Žbanić
  535581,  // Waves (2019) — Trey Edward Shults
  577922,  // Corpus Christi (2019) — Jan Komasa
  591028,  // The Wild Goose Lake (2019) — Diao Yinan
  601666,  // Portrait of a Lady on Fire (2019) — Céline Sciamma
  492188,  // Marriage Story (2019) — Noah Baumbach
  522241,  // The Souvenir (2019) — Joanna Hogg
  530385,  // Midsommar (2019) — Ari Aster
  508442,  // Burning (2018) — Lee Chang-dong
  534352,  // Cold War (2018) — Paweł Pawlikowski
  491418,  // The Favourite (2018) — Yorgos Lanthimos
  517208,  // Happy as Lazzaro (2018) — Alice Rohrwacher
  519632,  // Long Day's Journey Into Night (2018) — Bi Gan
  432121,  // Loveless (2017) — Andrei Zvyagintsev
  427396,  // BPM (120 Beats Per Minute) (2017) — Robin Campillo
  400535,  // First Reformed (2017) — Paul Schrader
  415442,  // A Ghost Story (2017) — David Lowery
  376867,  // Moonlight (2016) — Barry Jenkins
  344786,  // Toni Erdmann (2016) — Maren Ade
  342473,  // The Handmaiden (2016) — Park Chan-wook
  373977,  // Personal Shopper (2016) — Olivier Assayas
  247614,  // Aquarius (2016) — Kleber Mendonça Filho
  320573,  // Cemetery of Splendour (2015) — Apichatpong
  309566,  // Mustang (2015) — Deniz Gamze Ergüven
  295842,  // The Assassin (2015) — Hou Hsiao-hsien
  328111,  // Son of Saul (2015) — László Nemes
  381288,  // The Witch (2015) — Robert Eggers
  242268,  // The Duke of Burgundy (2014) — Peter Strickland
  258846,  // Leviathan (2014) — Andrei Zvyagintsev
  227700,  // Mommy (2014) — Xavier Dolan
  169232,  // Force Majeure (2014) — Ruben Östlund

  // ── 2000s arthouse ────────────────────────────────────────────────────
  218613,  // Ida (2013) — Paweł Pawlikowski
  92368,   // Holy Motors (2012) — Leos Carax
  104732,  // The Hunt / Jagten (2012) — Thomas Vinterberg
  70670,   // We Need to Talk About Kevin (2011) — Lynne Ramsay
  69151,   // Once Upon a Time in Anatolia (2011) — Nuri Bilge Ceylan
  74643,   // The Artist (2011) — Michel Hazanavicius
  46738,   // Certified Copy (2010) — Abbas Kiarostami
  52494,   // Poetry (2010) — Lee Chang-dong
  52365,   // Of Gods and Men (2010) — Xavier Beauvois
  27346,   // Dogtooth (2009) — Yorgos Lanthimos
  14280,   // Let the Right One In (2008) — Tomas Alfredson
  13277,   // The Class (2008) — Laurent Cantet
  19841,   // Memories of Murder (2003) — Bong Joon-ho
  670,     // Oldboy (2003) — Park Chan-wook
  9329,    // The Son / Le Fils (2002) — Dardenne Brothers
  4174,    // Irréversible (2002) — Gaspar Noé
  9343,    // Y Tu Mamá También (2001) — Alfonso Cuarón
  4761,    // The Piano Teacher (2001) — Michael Haneke
  1018,    // Mulholland Drive (2001) — David Lynch
  4803,    // Dogville (2003) — Lars von Trier
  9527,    // The Sweet Hereafter (1997) — Atom Egoyan
  9540,    // Secrets & Lies (1996) — Mike Leigh
  1933,    // The Lives of Others (2006) — Florian Henckel von Donnersmarck
  1638,    // Pan's Labyrinth (2006) — Guillermo del Toro
  13616,   // Still Life (2006) — Jia Zhangke
  12697,   // The Death of Mr. Lazarescu (2005) — Cristi Puiu
  89540,   // Police, Adjective (2009) — Corneliu Porumboiu
  11564,   // All About My Mother (1999) — Pedro Almodóvar
  14069,   // Talk to Her (2002) — Pedro Almodóvar
  1422,    // Eyes Wide Shut (1999) — Stanley Kubrick
  22803,   // Beau Travail (1999) — Claire Denis
  1582,    // La Haine / Hate (1995) — Mathieu Kassovitz
  9591,    // Funny Games (1997) — Michael Haneke
  44943,   // Platform (2000) — Jia Zhangke
  20765,   // La Ciénaga (2001) — Lucrecia Martel
  378236,  // First Cow (2019) — Kelly Reichardt
  70587,   // Meek's Cutoff (2010) — Kelly Reichardt
  95516,   // The Salesman (2016) — Asghar Farhadi
  107044,  // About Elly (2009) — Asghar Farhadi
  254128,  // The Lobster (2015) — Yorgos Lanthimos
  616037,  // The Lighthouse (2019) — Robert Eggers
  537915,  // Hereditary (2018) — Ari Aster
]);
