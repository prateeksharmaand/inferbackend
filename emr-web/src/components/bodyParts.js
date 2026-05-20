const u = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const S = (vb, content) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" fill="none" stroke="#334155" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${content}</svg>`;

export const BODY_PARTS = [
  {
    category: 'Full Body',
    parts: [
      {
        id: 'body_front', label: 'Body Front',
        src: u(S('0 0 80 180',
          `<ellipse cx="40" cy="14" rx="12" ry="13"/>
           <line x1="36" y1="26" x2="36" y2="31"/><line x1="44" y1="26" x2="44" y2="31"/>
           <path d="M22 32 Q16 38 17 56 L20 90 L60 90 L63 56 Q64 38 58 32 Q50 28 40 28 Q30 28 22 32Z"/>
           <line x1="28" y1="56" x2="28" y2="78"/><line x1="52" y1="56" x2="52" y2="78"/>
           <path d="M17 38 Q8 52 10 72 L16 71 Q14 53 22 42"/>
           <path d="M63 38 Q72 52 70 72 L64 71 Q66 53 58 42"/>
           <path d="M20 90 L16 130 L22 130 L28 100 M60 90 L64 130 L58 130 L52 100"/>
           <path d="M16 130 L14 170 L22 170 L24 130 M64 130 L66 170 L58 170 L56 130"/>
           <path d="M35 56 L35 88 M45 56 L45 88"/>`,
        )),
      },
      {
        id: 'body_back', label: 'Body Back',
        src: u(S('0 0 80 180',
          `<ellipse cx="40" cy="14" rx="12" ry="13"/>
           <line x1="36" y1="26" x2="36" y2="31"/><line x1="44" y1="26" x2="44" y2="31"/>
           <path d="M22 32 Q16 38 17 56 L20 90 L60 90 L63 56 Q64 38 58 32 Q50 28 40 28 Q30 28 22 32Z"/>
           <path d="M40 32 L40 88"/>
           <path d="M24 40 L56 40 M22 55 L58 55 M22 70 L58 70"/>
           <path d="M17 38 Q8 52 10 72 L16 71 Q14 53 22 42"/>
           <path d="M63 38 Q72 52 70 72 L64 71 Q66 53 58 42"/>
           <path d="M20 90 L16 130 L22 130 L28 100 M60 90 L64 130 L58 130 L52 100"/>
           <path d="M16 130 L14 170 L22 170 L24 130 M64 130 L66 170 L58 170 L56 130"/>`,
        )),
      },
    ],
  },
  {
    category: 'Head & Face',
    parts: [
      {
        id: 'head_face', label: 'Face',
        src: u(S('0 0 80 90',
          `<ellipse cx="40" cy="42" rx="30" ry="36"/>
           <ellipse cx="28" cy="36" rx="6" ry="4"/>
           <ellipse cx="52" cy="36" rx="6" ry="4"/>
           <circle cx="28" cy="36" r="2" fill="#334155"/>
           <circle cx="52" cy="36" r="2" fill="#334155"/>
           <path d="M34 55 Q40 62 46 55"/>
           <ellipse cx="40" cy="48" rx="3" ry="4"/>
           <path d="M22 26 Q28 20 34 24"/>
           <path d="M58 26 Q52 20 46 24"/>
           <path d="M18 42 Q12 44 14 52 Q18 52 20 46"/>
           <path d="M62 42 Q68 44 66 52 Q62 52 60 46"/>`,
        )),
      },
      {
        id: 'skull', label: 'Skull',
        src: u(S('0 0 80 90',
          `<path d="M40 8 Q14 8 12 36 Q10 56 20 66 L22 76 L58 76 L60 66 Q70 56 68 36 Q66 8 40 8Z"/>
           <ellipse cx="28" cy="40" rx="8" ry="9"/>
           <ellipse cx="52" cy="40" rx="8" ry="9"/>
           <path d="M36 60 L36 76 M44 60 L44 76 M40 60 L40 76"/>
           <path d="M26 76 Q40 80 54 76"/>`,
        )),
      },
      {
        id: 'eye', label: 'Eye',
        src: u(S('0 0 80 50',
          `<path d="M8 25 Q20 8 40 8 Q60 8 72 25 Q60 42 40 42 Q20 42 8 25Z"/>
           <circle cx="40" cy="25" r="12"/>
           <circle cx="40" cy="25" r="7" fill="#334155"/>
           <circle cx="44" cy="21" r="2" fill="white"/>
           <path d="M28 16 Q40 10 52 16"/>`,
        )),
      },
      {
        id: 'ear', label: 'Ear',
        src: u(S('0 0 60 90',
          `<path d="M30 8 Q52 8 52 45 Q52 72 38 78 L34 80 L30 78 Q18 70 18 52 Q18 42 26 38 Q32 34 32 28 Q32 20 26 18"/>
           <path d="M30 78 Q26 70 28 60 Q30 52 38 50 Q44 48 44 40 Q44 30 38 26 Q34 24 32 28"/>
           <path d="M18 52 Q14 52 12 44 Q12 30 20 20 Q26 12 30 8"/>`,
        )),
      },
      {
        id: 'nose', label: 'Nose',
        src: u(S('0 0 60 80',
          `<path d="M30 8 Q26 30 18 52 Q14 64 18 68 Q24 74 30 70 Q36 74 42 68 Q46 64 42 52 Q34 30 30 8Z"/>
           <ellipse cx="22" cy="60" rx="7" ry="5"/>
           <ellipse cx="38" cy="60" rx="7" ry="5"/>
           <path d="M29 70 Q30 72 31 70"/>`,
        )),
      },
    ],
  },
  {
    category: 'Upper Body',
    parts: [
      {
        id: 'shoulder', label: 'Shoulder',
        src: u(S('0 0 90 80',
          `<circle cx="28" cy="28" r="18"/>
           <circle cx="28" cy="28" r="8"/>
           <path d="M44 20 Q58 14 68 20 Q74 26 70 36 Q66 44 56 44 L44 40"/>
           <path d="M10 40 Q6 52 10 62 L18 60 Q16 52 18 44"/>
           <path d="M22 44 L20 70 L28 70 L30 46"/>`,
        )),
      },
      {
        id: 'chest', label: 'Chest',
        src: u(S('0 0 100 80',
          `<path d="M10 10 L10 70 L90 70 L90 10 Q80 6 50 6 Q20 6 10 10Z"/>
           <path d="M50 10 L50 70"/>
           <path d="M10 30 Q30 24 50 26 Q70 24 90 30"/>
           <ellipse cx="30" cy="20" rx="14" ry="8"/>
           <ellipse cx="70" cy="20" rx="14" ry="8"/>
           <path d="M10 10 Q20 4 30 6 Q40 8 50 6"/>
           <path d="M90 10 Q80 4 70 6 Q60 8 50 6"/>`,
        )),
      },
      {
        id: 'hand', label: 'Hand',
        src: u(S('0 0 70 90',
          `<path d="M18 52 L18 28 Q18 22 24 22 Q30 22 30 28 L30 40"/>
           <path d="M30 40 L30 20 Q30 14 36 14 Q42 14 42 20 L42 40"/>
           <path d="M42 40 L42 22 Q42 16 48 16 Q54 16 54 22 L54 42"/>
           <path d="M54 42 L54 28 Q54 22 60 22 Q64 26 62 34 L58 52"/>
           <path d="M18 52 Q16 64 20 72 L26 78 L44 78 L56 72 L58 52 Q54 46 42 44 Q36 42 30 44 Q24 46 18 52Z"/>
           <path d="M12 46 Q8 36 12 28 Q16 20 22 22"/>`,
        )),
      },
      {
        id: 'arm', label: 'Arm',
        src: u(S('0 0 60 120',
          `<path d="M22 8 Q14 8 12 20 L10 60 Q10 70 16 74 L20 76 Q26 50 28 30"/>
           <path d="M38 8 Q46 8 48 20 L50 60 Q50 70 44 74 L40 76 Q34 50 32 30"/>
           <path d="M22 8 Q30 4 38 8"/>
           <path d="M16 74 Q30 80 44 74"/>
           <path d="M16 74 L14 90 Q12 100 16 106 L22 110 L38 110 L44 106 Q48 100 46 90 L44 74"/>
           <path d="M20 110 Q30 114 40 110"/>`,
        )),
      },
    ],
  },
  {
    category: 'Lower Body',
    parts: [
      {
        id: 'knee', label: 'Knee',
        src: u(S('0 0 70 100',
          `<path d="M20 8 L20 42 Q20 56 35 60 Q50 56 50 42 L50 8"/>
           <path d="M20 8 Q35 4 50 8"/>
           <ellipse cx="35" cy="52" rx="18" ry="14"/>
           <path d="M20 62 L18 94 Q26 98 35 98 Q44 98 52 94 L50 62"/>
           <path d="M22 52 Q16 54 14 60"/>
           <path d="M48 52 Q54 54 56 60"/>`,
        )),
      },
      {
        id: 'foot', label: 'Foot',
        src: u(S('0 0 100 70',
          `<path d="M12 20 Q10 36 12 48 Q16 58 28 60 L72 60 Q84 58 88 50 Q92 40 88 34 Q84 28 76 30 L56 30 Q44 14 36 10 Q26 6 20 10 Q12 14 12 20Z"/>
           <path d="M56 30 L56 60"/>
           <path d="M64 30 L66 60"/>
           <path d="M72 32 L74 60"/>
           <path d="M80 36 L80 58"/>
           <path d="M36 10 Q32 4 28 8 Q24 12 26 20 Q30 28 38 28"/>`,
        )),
      },
      {
        id: 'leg', label: 'Leg',
        src: u(S('0 0 60 130',
          `<path d="M18 8 L16 60 Q14 72 20 78 L24 80"/>
           <path d="M42 8 L44 60 Q46 72 40 78 L36 80"/>
           <path d="M18 8 Q30 4 42 8"/>
           <path d="M24 80 Q30 84 36 80"/>
           <path d="M24 80 L22 110 Q20 120 26 124 L34 124 Q40 120 38 110 L36 80"/>
           <path d="M26 124 Q30 128 34 124"/>`,
        )),
      },
    ],
  },
  {
    category: 'Internal Organs',
    parts: [
      {
        id: 'heart', label: 'Heart',
        src: u(S('0 0 80 80',
          `<path d="M40 68 Q12 50 10 30 Q10 14 22 12 Q30 10 36 18 Q38 22 40 26 Q42 22 44 18 Q50 10 58 12 Q70 14 70 30 Q68 50 40 68Z"/>
           <path d="M40 26 L38 46 L44 46 L42 36"/>
           <path d="M32 30 L28 32 L28 42 L32 44 M48 30 L52 32 L52 42 L48 44"/>
           <path d="M32 30 L48 30"/>`,
        )),
      },
      {
        id: 'lungs', label: 'Lungs',
        src: u(S('0 0 90 90',
          `<path d="M40 8 L40 78"/>
           <path d="M40 12 Q32 12 26 18 Q16 28 14 44 Q12 58 18 68 Q24 76 32 74 Q42 70 40 58 L40 28"/>
           <path d="M40 12 Q48 12 54 18 Q64 28 66 44 Q68 58 62 68 Q56 76 48 74 Q38 70 40 58 L40 28"/>
           <path d="M26 36 Q20 44 20 54"/>
           <path d="M54 36 Q60 44 60 54"/>
           <path d="M30 46 Q28 54 30 62"/>
           <path d="M50 46 Q52 54 50 62"/>`,
        )),
      },
      {
        id: 'brain', label: 'Brain',
        src: u(S('0 0 90 80',
          `<path d="M45 72 L45 68 Q36 66 30 60 Q20 54 18 44 Q14 32 20 24 Q26 16 34 16 Q38 16 40 18 Q42 14 46 12 Q52 10 58 14 Q64 18 68 26 Q72 34 70 44 Q68 56 58 64 Q52 68 45 68Z"/>
           <path d="M45 16 L45 68"/>
           <path d="M20 34 Q28 30 34 36 Q38 40 36 46"/>
           <path d="M70 34 Q62 30 56 36 Q52 40 54 46"/>
           <path d="M22 46 Q30 52 36 50"/>
           <path d="M68 46 Q60 52 54 50"/>
           <path d="M30 24 Q34 20 38 22"/>
           <path d="M60 24 Q56 20 52 22"/>`,
        )),
      },
      {
        id: 'liver', label: 'Liver',
        src: u(S('0 0 90 70',
          `<path d="M10 30 Q10 14 28 10 Q46 6 62 10 Q78 14 78 28 Q80 44 68 54 Q56 64 38 62 Q20 60 12 48 Q8 40 10 30Z"/>
           <path d="M38 62 Q38 68 40 70"/>
           <path d="M52 56 Q58 62 56 68"/>
           <path d="M24 40 Q28 44 34 42 Q40 40 40 34"/>
           <path d="M48 14 Q54 18 58 14"/>`,
        )),
      },
      {
        id: 'kidney', label: 'Kidneys',
        src: u(S('0 0 90 70',
          `<path d="M14 12 Q6 16 6 35 Q6 54 14 58 Q22 62 28 56 Q32 50 30 35 Q28 20 22 14 Q18 10 14 12Z"/>
           <path d="M22 20 Q18 28 18 35 Q18 42 22 48"/>
           <path d="M76 12 Q84 16 84 35 Q84 54 76 58 Q68 62 62 56 Q58 50 60 35 Q62 20 68 14 Q72 10 76 12Z"/>
           <path d="M68 20 Q72 28 72 35 Q72 42 68 48"/>`,
        )),
      },
      {
        id: 'stomach', label: 'Stomach',
        src: u(S('0 0 80 80',
          `<path d="M22 16 Q14 16 12 28 Q10 42 14 54 Q18 66 30 70 Q44 74 56 66 Q68 56 68 42 Q68 28 58 22 Q50 16 42 18 Q34 20 30 28 Q26 22 22 16Z"/>
           <path d="M22 16 Q26 10 32 12"/>
           <path d="M58 22 Q64 16 66 22"/>
           <path d="M18 36 Q16 44 18 52"/>
           <path d="M62 32 Q64 40 62 50"/>`,
        )),
      },
      {
        id: 'spine', label: 'Spine',
        src: u(S('0 0 60 140',
          `${Array.from({ length: 9 }, (_, i) => {
            const y = 10 + i * 14;
            return `<rect x="22" y="${y}" width="16" height="10" rx="2"/>
                    <line x1="14" y1="${y + 5}" x2="22" y2="${y + 5}"/>
                    <line x1="46" y1="${y + 5}" x2="38" y2="${y + 5}"/>`;
          }).join('')}
           <line x1="30" y1="10" x2="30" y2="134"/>`,
        )),
      },
      {
        id: 'bladder', label: 'Bladder',
        src: u(S('0 0 70 80',
          `<path d="M35 10 Q14 10 12 34 Q10 54 20 64 Q28 72 35 72 Q42 72 50 64 Q60 54 58 34 Q56 10 35 10Z"/>
           <path d="M30 72 L28 80 M40 72 L38 80"/>
           <path d="M22 36 Q20 44 22 52"/>
           <path d="M48 36 Q50 44 48 52"/>`,
        )),
      },
      {
        id: 'intestines', label: 'Intestines',
        src: u(S('0 0 80 90',
          `<path d="M20 10 Q10 10 10 20 Q10 30 20 30 L50 30 Q60 30 60 40 Q60 50 50 50 L30 50 Q18 50 16 60 Q14 70 22 74 Q30 78 38 74 Q46 70 44 62 L44 54"/>
           <path d="M60 10 L20 10"/>
           <path d="M60 10 Q70 10 70 20 Q70 30 60 30"/>
           <path d="M44 74 Q52 78 60 74 Q68 68 66 58 Q64 48 54 46"/>`,
        )),
      },
    ],
  },
];
