// Preset molecules: experimental geometries (angstrom), Morse constants for
// diatomics (Huber & Herzberg via NIST; HeH+ per Coxon & Hajigeorgiou 1999),
// experimental dipoles (D) and vertical ionization potentials (eV).
// Names are localized {en, ru, de, es}; facts are localized {en, ru} and
// fall back to English for other locales.
// Morse width a is derived from we via a = 0.0013544 * we * sqrt(mu/De).
(function (App) {
  "use strict";

  App.PRESETS = [
    {
      id: "H2", formula: "H\u2082", charge: 0,
      name: { en: "hydrogen", ru: "водород", de: "Wasserstoff", es: "hidrógeno", zh: "氢" },
      xyz: "H 0 0 0\nH 0 0 0.7414",
      morse: { De: 4.747, Re: 0.7414, a: 1.9426 },
      exp: { ip: 15.43, dipole: 0 },
      facts: {
        ru: [
          "Эталон ковалентной связи: оба кванта электронного поля занимают одну связывающую моду σg.",
          "КЭД-поправка (лэмбовский сдвиг) к энергии диссоциации составляет −0.195 см⁻¹ и подтверждена экспериментально.",
          "Для двухэлектронной системы здесь дополнительно решается точная задача (полное КВ) — зелёная кривая на графике E(R)."
        ],
        en: [
          "The reference covalent bond: both quanta of the electron field occupy a single bonding σg mode.",
          "The QED correction (Lamb shift) to the dissociation energy is −0.195 cm⁻¹ and has been confirmed experimentally.",
          "For this two-electron system the exact problem (full CI) is also solved here — the green curve in the E(R) chart."
        ]
      }
    },
    {
      id: "HeH+", formula: "HeH\u207a", charge: 1,
      name: { en: "helium hydride", ru: "гидрид гелия", de: "Heliumhydrid", es: "hidruro de helio", zh: "氢化氦" },
      xyz: "He 0 0 0\nH 0 0 0.7743",
      morse: { De: 2.040, Re: 0.7743, a: 2.74 },
      exp: {},
      facts: {
        ru: [
          "Первая молекула Вселенной: образовалась примерно через 380 тыс. лет после Большого взрыва, в эпоху рекомбинации.",
          "Сильно полярная связь: около 80% плотности поля сосредоточено у ядра гелия (см. заряды по Малликену)."
        ],
        en: [
          "The first molecule of the Universe: it formed roughly 380,000 years after the Big Bang, during recombination.",
          "A strongly polar bond: about 80% of the field density resides at the helium nucleus (see the Mulliken charges)."
        ]
      }
    },
    {
      id: "He2", formula: "He\u2082", charge: 0,
      name: { en: "why it does not bind", ru: "почему она не связана", de: "warum nicht gebunden", es: "por qué no se enlaza", zh: "为何不成键" },
      xyz: "He 0 0 0\nHe 0 0 3.0",
      morse: null,
      exp: { dipole: 0 },
      facts: {
        ru: [
          "Связывающая σg и разрыхляющая σu* моды заполнены полностью — порядок связи равен нулю: паулиевское отталкивание следует из антикоммутации поля. Сопоставьте с порядком по Майеру в свойствах.",
          "Остаётся лишь ван-дер-ваальсов минимум глубиной ~0.001 эВ при R ≈ 3 Å — следствие вакуумных флуктуаций (эффект Казимира–Полдера). Димер наблюдается только при милликельвиновых температурах."
        ],
        en: [
          "Both the bonding σg and the antibonding σu* modes are fully occupied — the bond order is zero: Pauli repulsion follows from field anticommutation. Compare with the Mayer bond order in the properties panel.",
          "Only a van der Waals well of ~0.001 eV at R ≈ 3 Å remains — a consequence of vacuum fluctuations (the Casimir–Polder effect). The dimer is observed only at millikelvin temperatures."
        ]
      }
    },
    {
      id: "LiH", formula: "LiH", charge: 0,
      name: { en: "lithium hydride", ru: "гидрид лития", de: "Lithiumhydrid", es: "hidruro de litio", zh: "氢化锂" },
      xyz: "Li 0 0 0\nH 0 0 1.5957",
      morse: { De: 2.515, Re: 1.5957, a: 1.13 },
      exp: { ip: 7.9, dipole: 5.88 },
      facts: {
        ru: [
          "Связь, близкая к ионной: плотность поля смещена к водороду (Li⁺H⁻), что объясняет большой дипольный момент ~6 Д."
        ],
        en: [
          "A nearly ionic bond: the field density is pulled towards hydrogen (Li⁺H⁻), which explains the large dipole moment of ~6 D."
        ]
      }
    },
    {
      id: "Li2", formula: "Li\u2082", charge: 0,
      name: { en: "dilithium", ru: "дилитий", de: "Dilithium", es: "dilitio", zh: "双锂" },
      xyz: "Li 0 0 0\nLi 0 0 2.6729",
      morse: { De: 1.06, Re: 2.6729, a: 0.87 },
      exp: { ip: 5.11, dipole: 0 },
      facts: {
        ru: [
          "Самая слабая ковалентная связь среди пресетов: диффузные 2s-моды, Dₑ всего 1.06 эВ.",
          "Остовные 1s-моды практически не перекрываются — связывание обеспечивает одна валентная пара."
        ],
        en: [
          "The loosest covalent bond among the presets: diffuse 2s modes, Dₑ of only 1.06 eV.",
          "The 1s core modes barely overlap — a single valence pair provides the bonding."
        ]
      }
    },
    {
      id: "N2", formula: "N\u2082", charge: 0,
      name: { en: "nitrogen", ru: "азот", de: "Stickstoff", es: "nitrógeno", zh: "氮" },
      xyz: "N 0 0 0\nN 0 0 1.0977",
      morse: { De: 9.905, Re: 1.0977, a: 2.69 },
      exp: { ip: 15.58, dipole: 0 },
      facts: {
        ru: [
          "Тройная связь: мода σ и две вырожденные π-моды; порядок по Майеру равен 3 (см. свойства).",
          "Одна из самых прочных связей в химии (Dₑ ≈ 9.9 эВ) — причина инертности атмосферного азота."
        ],
        en: [
          "A triple bond: one σ mode and two degenerate π modes; the Mayer bond order equals 3 (see properties).",
          "One of the strongest bonds in chemistry (Dₑ ≈ 9.9 eV) — the reason atmospheric nitrogen is so inert."
        ]
      }
    },
    {
      id: "CO", formula: "CO", charge: 0,
      name: { en: "carbon monoxide", ru: "монооксид углерода", de: "Kohlenmonoxid", es: "monóxido de carbono", zh: "一氧化碳" },
      xyz: "C 0 0 0\nO 0 0 1.1283",
      morse: { De: 11.226, Re: 1.1283, a: 2.30 },
      exp: { ip: 14.01, dipole: 0.11 },
      facts: {
        ru: [
          "Изоэлектронен N₂, однако моды асимметричны: ВЗМО локализована преимущественно на углероде — этим объясняется связывание CO с железом гемоглобина.",
          "Известный аномальный диполь: всего ~0.1 Д, причём отрицательный полюс расположен на углероде, вопреки шкале электроотрицательности."
        ],
        en: [
          "Isoelectronic with N₂, yet the modes are asymmetric: the HOMO protrudes towards carbon — which is how CO binds to the iron of hemoglobin.",
          "The famous anomalous dipole: only ~0.1 D, with the negative end on carbon, contrary to electronegativity."
        ]
      }
    },
    {
      id: "O2", formula: "O\u2082", charge: 0, mult: 3,
      name: { en: "oxygen (triplet, UHF)", ru: "кислород (триплет, UHF)", de: "Sauerstoff (Triplett, UHF)", es: "oxígeno (triplete, UHF)", zh: "氧（三重态，UHF）" },
      xyz: "O 0 0 0\nO 0 0 1.2075",
      morse: { De: 5.213, Re: 1.2075, a: 2.65 },
      exp: { ip: 12.30, dipole: 0 },
      facts: {
        ru: [
          "Триплетное основное состояние: два неспаренных кванта в вырожденных π*-модах — кислород парамагнитен, жидкий O₂ притягивается к магниту. Включите карту ρₛ.",
          "Замкнутые оболочки (RHF) для O₂ неприменимы — расчёт ведётся методом UHF: α- и β-моды имеют разные профили, величина ⟨S²⟩ приведена в балансе."
        ],
        en: [
          "A triplet ground state: two unpaired quanta in degenerate π* modes — oxygen is paramagnetic, and liquid O₂ sticks to a magnet. Switch on the ρₛ map.",
          "Closed-shell RHF is not applicable to O₂ — it is computed with UHF: α and β modes have different profiles, and ⟨S²⟩ is reported in the budget."
        ]
      }
    },
    {
      id: "NO", formula: "NO", charge: 0, mult: 2,
      name: { en: "nitric oxide (radical)", ru: "оксид азота (радикал)", de: "Stickstoffmonoxid (Radikal)", es: "óxido nítrico (radical)", zh: "一氧化氮（自由基）" },
      xyz: "N 0 0 0\nO 0 0 1.1508",
      morse: { De: 6.61, Re: 1.1508, a: 2.74 },
      exp: { ip: 9.26, dipole: 0.159 },
      facts: {
        ru: [
          "Устойчивый радикал: один неспаренный квант в π*-моде (виден на карте ρₛ).",
          "Сигнальная молекула сосудистой системы — Нобелевская премия по физиологии и медицине 1998 года."
        ],
        en: [
          "A stable radical: one unpaired quantum in a π* mode (visible in the ρₛ map).",
          "A signalling molecule of the vascular system — the 1998 Nobel Prize in Physiology or Medicine."
        ]
      }
    },
    {
      id: "OH", formula: "OH\u2022", charge: 0, mult: 2,
      name: { en: "hydroxyl (radical)", ru: "гидроксил (радикал)", de: "Hydroxyl (Radikal)", es: "hidroxilo (radical)", zh: "羟基（自由基）" },
      xyz: "O 0 0 0\nH 0 0 0.9697",
      morse: { De: 4.62, Re: 0.9697, a: 2.29 },
      exp: { ip: 13.02, dipole: 1.668 },
      facts: {
        ru: [
          "«Детергент атмосферы»: главный окислитель тропосферы, характерное время жизни — доли секунды.",
          "Неспаренный спин занимает p-моду кислорода, перпендикулярную связи, — см. карту ρₛ."
        ],
        en: [
          "The “detergent of the atmosphere”: the main tropospheric oxidant, with a lifetime of a fraction of a second.",
          "The unpaired spin occupies an oxygen p mode perpendicular to the bond — see the ρₛ map."
        ]
      }
    },
    {
      id: "F2", formula: "F\u2082", charge: 0,
      name: { en: "fluorine", ru: "фтор", de: "Fluor", es: "flúor", zh: "氟" },
      xyz: "F 0 0 0\nF 0 0 1.4119",
      morse: { De: 1.66, Re: 1.4119, a: 2.97 },
      exp: { ip: 15.70, dipole: 0 },
      facts: {
        ru: [
          "Формально одинарная связь, однако заполненные π*-моды выталкивают плотность из межъядерной области — связь слабая (1.66 эВ), что объясняет исключительную реакционную способность фтора."
        ],
        en: [
          "Formally a single bond, yet the filled π* modes push density out of the internuclear region — the bond is weak (1.66 eV), which explains the exceptional reactivity of fluorine."
        ]
      }
    },
    {
      id: "H2O", formula: "H\u2082O", charge: 0,
      name: { en: "water", ru: "вода", de: "Wasser", es: "agua", zh: "水" },
      xyz: "O 0 0 0.1173\nH 0 0.7572 -0.4692\nH 0 -0.7572 -0.4692",
      morse: null,
      exp: { ip: 12.62, dipole: 1.855 },
      facts: {
        ru: [
          "Изогнутая геометрия (104.5°) обусловлена двумя неподелёнными парами — найдите их среди занятых МО (ВЗМО — почти чистая 2p-мода кислорода).",
          "Дипольный момент 1.85 Д определяет свойства воды: водородные связи, растворение солей, аномалии льда."
        ],
        en: [
          "The bent geometry (104.5°) is due to two lone pairs — find them among the occupied MOs (the HOMO is an almost pure oxygen 2p mode).",
          "The 1.85 D dipole moment defines water’s behaviour: hydrogen bonding, salt dissolution, the anomalies of ice."
        ]
      }
    },
    {
      id: "NH3", formula: "NH\u2083", charge: 0,
      name: { en: "ammonia", ru: "аммиак", de: "Ammoniak", es: "amoníaco", zh: "氨" },
      xyz: "N 0 0 0\nH 0.9373 0 -0.3815\nH -0.4686 0.8117 -0.3815\nH -0.4686 -0.8117 -0.3815",
      morse: null,
      exp: { ip: 10.82, dipole: 1.472 },
      facts: {
        ru: [
          "Пирамидальная молекула с неподелённой парой (ВЗМО) на вершине — именно она определяет осно́вные свойства аммиака."
        ],
        en: [
          "A pyramidal molecule with a lone pair (the HOMO) at the apex — it is what makes ammonia a base."
        ]
      }
    },
    {
      id: "CH4", formula: "CH\u2084", charge: 0,
      name: { en: "methane", ru: "метан", de: "Methan", es: "metano", zh: "甲烷" },
      xyz: "C 0 0 0\nH 0.6276 0.6276 0.6276\nH 0.6276 -0.6276 -0.6276\nH -0.6276 0.6276 -0.6276\nH -0.6276 -0.6276 0.6276",
      morse: null,
      exp: { ip: 13.6, dipole: 0 },
      facts: {
        ru: [
          "Тетраэдр: три вырожденные t₂-моды поля и одна a₁ вместо четырёх «отдельных связей» — делокализация видна непосредственно на МО. Локализация Бойса возвращает четыре эквивалентные связи C–H."
        ],
        en: [
          "A tetrahedron: three degenerate t₂ field modes plus one a₁ instead of four “separate bonds” — the delocalization is directly visible in the MOs. Boys localization recovers four equivalent C–H bonds."
        ]
      }
    },
    {
      id: "CH3", formula: "CH\u2083\u2022", charge: 0, mult: 2,
      name: { en: "methyl (radical)", ru: "метил (радикал)", de: "Methyl (Radikal)", es: "metilo (radical)", zh: "甲基（自由基）" },
      xyz: "C 0 0 0\nH 1.079 0 0\nH -0.5395 0.93444 0\nH -0.5395 -0.93444 0",
      morse: null,
      exp: { ip: 9.84, dipole: 0 },
      facts: {
        ru: [
          "Плоский радикал (D₃h): неспаренный квант занимает чистую p-моду углерода, перпендикулярную плоскости. На карте ρₛ она видна двумя лепестками.",
          "Ключевой интермедиат горения и крекинга углеводородов."
        ],
        en: [
          "A planar radical (D₃h): the unpaired quantum occupies a pure carbon p mode perpendicular to the plane. The ρₛ map shows its two lobes.",
          "A key intermediate of combustion and hydrocarbon cracking."
        ]
      }
    },
    {
      id: "CO2", formula: "CO\u2082", charge: 0,
      name: { en: "carbon dioxide", ru: "диоксид углерода", de: "Kohlendioxid", es: "dióxido de carbono", zh: "二氧化碳" },
      xyz: "O 0 0 -1.16\nC 0 0 0\nO 0 0 1.16",
      morse: null,
      exp: { ip: 13.78, dipole: 0 },
      facts: {
        ru: [
          "Линейная молекула: две ортогональные π-системы, делокализованные по трём ядрам.",
          "Несмотря на полярные связи, суммарный дипольный момент равен нулю — следствие симметрии мод поля (проверьте в свойствах)."
        ],
        en: [
          "A linear molecule: two orthogonal π systems delocalized over three nuclei.",
          "Despite polar bonds, the net dipole moment is zero — a consequence of the symmetry of the field modes (verify in the properties panel)."
        ]
      }
    },
    {
      id: "C2H4", formula: "C\u2082H\u2084", charge: 0,
      name: { en: "ethylene", ru: "этилен", de: "Ethylen", es: "etileno", zh: "乙烯" },
      xyz: "C 0.6695 0 0\nC -0.6695 0 0\nH 1.234 0.9279 0\nH 1.234 -0.9279 0\nH -1.234 0.9279 0\nH -1.234 -0.9279 0",
      morse: null,
      exp: { ip: 10.68, dipole: 0 },
      facts: {
        ru: [
          "Классическая π-связь: ВЗМО — два лепестка над и под плоскостью молекулы. Она запрещает вращение вокруг C=C; порядок по Майеру ≈ 2."
        ],
        en: [
          "The classic π bond: the HOMO consists of two lobes above and below the molecular plane. It forbids rotation about C=C; the Mayer bond order is ≈ 2."
        ]
      }
    },
    {
      id: "C6H6", formula: "C\u2086H\u2086", charge: 0,
      name: { en: "benzene (\u224815 s to compute)", ru: "бензол (расчёт ~15 с)", de: "Benzol (\u224815 s Rechenzeit)", es: "benceno (\u224815 s de c\u00e1lculo)", zh: "苯（计算约 15 秒）" },
      xyz: (function () {
        var lines = [];
        for (var k = 0; k < 6; k++) {
          var a = Math.PI / 3 * k;
          lines.push("C " + (1.397 * Math.cos(a)).toFixed(4) + " " + (1.397 * Math.sin(a)).toFixed(4) + " 0");
          lines.push("H " + (2.481 * Math.cos(a)).toFixed(4) + " " + (2.481 * Math.sin(a)).toFixed(4) + " 0");
        }
        return lines.join("\n");
      })(),
      morse: null,
      exp: { ip: 9.45, dipole: 0 },
      facts: {
        ru: [
          "Ароматическая система: шесть π-квантов в модах, делокализованных по всему кольцу — порядок связи C–C по Майеру ≈ 1.45, между одинарной и двойной.",
          "36 базисных функций, ~1.7 млн уникальных интегралов — всё вычисляется непосредственно в браузере."
        ],
        en: [
          "An aromatic system: six π quanta in modes delocalized over the whole ring — the Mayer C–C bond order is ≈ 1.45, between single and double.",
          "36 basis functions, ~1.7 million unique integrals — all evaluated directly in the browser."
        ]
      }
    }
  ];

  App.getPreset = function (id) {
    for (var i = 0; i < App.PRESETS.length; i++) if (App.PRESETS[i].id === id) return App.PRESETS[i];
    return null;
  };

  // "H₂O — water" in the active language (En fallback)
  App.presetTitle = function (p) {
    var n = p.name[App.LANG] || p.name.en;
    return p.formula + " \u2014 " + n;
  };
  App.presetFacts = function (p) {
    return (p.facts && (p.facts[App.LANG] || p.facts.en)) || [];
  };
})(typeof globalThis.App === "object" ? globalThis.App : (globalThis.App = {}));
