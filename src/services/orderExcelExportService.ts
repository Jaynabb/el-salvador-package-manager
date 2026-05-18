import { doc, getDoc, collection, addDoc } from 'firebase/firestore';
import { db } from './firebase';
import { getValidAccessToken } from './orderExportService';
import type { OrderRow } from '../components/OrderManagement';
import type { Organization } from '../types';

/**
 * Desarrollo Google Sheets Export Service
 * Creates a Google Sheet in the CONTROL format for customs submission.
 * Each page of the form is a separate sheet tab ("Hoja 1", "Hoja 2", etc.)
 * so that each page prints cleanly without bleeding into the next.
 */

// ── Constants ────────────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 68;
const OVERHEAD_ROWS = 15; // title(7) + blank(1) + headers(2) + subtotal(1) + blank(2) + sig(2)
const GRID_ROWS_PER_PAGE = ROWS_PER_PAGE - OVERHEAD_ROWS; // 53

// The SUBTOTAL row is always at the same 0-indexed position on every sheet:
// title(7) + blank(1) + headers(2) + grid(53) = row 63  → A1 row 64
const SUBTOTAL_ROW_0 = 63;
const SUBTOTAL_ROW_A1 = SUBTOTAL_ROW_0 + 1; // 64

// Column widths in pixels
const COLUMN_WIDTHS_PX: Record<number, number> = {
  0: 70,   // A
  1: 21,   // B
  2: 192,  // C — Consignatario
  3: 113,  // D — No de PK
  4: 43,   // E — Cant.
  5: 410,  // F — Descripcion
  6: 71,   // G — Usado
  7: 119,  // H — Nuevo
  8: 96,   // I — Valor Unit.
  9: 168,  // J — Total
  10: 70,  // K — IVA
};

const ROW_HEIGHT_PX = 21;

// Google Sheets formatting constants
const SOLID_BLACK = {
  style: 'SOLID' as const,
  colorStyle: { rgbColor: { red: 0, green: 0, blue: 0 } },
};

const ALL_BORDERS = {
  top: SOLID_BLACK,
  bottom: SOLID_BLACK,
  left: SOLID_BLACK,
  right: SOLID_BLACK,
};

const FONT_NORMAL = {
  fontFamily: 'Calibri',
  fontSize: 11,
  foregroundColorStyle: { rgbColor: { red: 0, green: 0, blue: 0 } },
};

const FONT_BOLD = { ...FONT_NORMAL, bold: true };

const CURRENCY_FORMAT = { type: 'NUMBER' as const, pattern: '"$"#,##0.00' };

// ── English → Spanish translation for item descriptions ─────────────────────

const PHRASE_MAP: Record<string, string> = {
  // Multi-word phrases (matched first, longest first)
  'SCREEN PROTECTOR': 'PROTECTOR DE PANTALLA',
  'PHONE CASE': 'FUNDA DE TELÉFONO',
  'CELL PHONE': 'TELÉFONO CELULAR',
  'SMART WATCH': 'RELOJ INTELIGENTE',
  'SMART PHONE': 'TELÉFONO INTELIGENTE',
  'POWER BANK': 'BATERÍA PORTÁTIL',
  'MEMORY CARD': 'TARJETA DE MEMORIA',
  'FLASH DRIVE': 'MEMORIA USB',
  'HARD DRIVE': 'DISCO DURO',
  'HOME GOODS': 'ARTÍCULOS PARA EL HOGAR',
  'STUFFED ANIMAL': 'PELUCHE',
  'ACTION FIGURE': 'FIGURA DE ACCIÓN',
  'HAIR DRYER': 'SECADORA DE CABELLO',
  'CURLING IRON': 'RIZADOR DE CABELLO',
  'FLAT IRON': 'PLANCHA DE CABELLO',
  'NAIL POLISH': 'ESMALTE DE UÑAS',
  'BABY CLOTHES': 'ROPA DE BEBÉ',
  'BABY SHOES': 'ZAPATOS DE BEBÉ',
  'RUNNING SHOES': 'ZAPATOS PARA CORRER',
  'HIGH HEELS': 'TACONES ALTOS',
  'FLIP FLOPS': 'CHANCLETAS',
  'SWIM SUIT': 'TRAJE DE BAÑO',
  'SWIMSUIT': 'TRAJE DE BAÑO',
  'BATHING SUIT': 'TRAJE DE BAÑO',
  'TANK TOP': 'CAMISETA SIN MANGAS',
  'LONG SLEEVE': 'MANGA LARGA',
  'SHORT SLEEVE': 'MANGA CORTA',
  'NO ITEM DETAILS': 'SIN DETALLES DE ARTÍCULO',
  'STAINLESS STEEL': 'ACERO INOXIDABLE',
  'ESSENTIAL OIL': 'ACEITE ESENCIAL',
  'WATER BOTTLE': 'BOTELLA DE AGUA',
  'TRAVEL BAG': 'BOLSA DE VIAJE',
  'FANNY PACK': 'CANGURO',
  'MAKE UP': 'MAQUILLAJE',
  'MAKEUP': 'MAQUILLAJE',
  'SKIN CARE': 'CUIDADO DE PIEL',
  'SKINCARE': 'CUIDADO DE PIEL',
  'HAIR CLIP': 'PINZA DE CABELLO',
  'HAIR TIE': 'LIGA DE CABELLO',
  'GIFT SET': 'SET DE REGALO',
  'TOY SET': 'SET DE JUGUETE',
  'TOOL SET': 'SET DE HERRAMIENTAS',
  'BED SHEET': 'SÁBANA',
  'BED SHEETS': 'SÁBANAS',
  'PILLOW CASE': 'FUNDA DE ALMOHADA',
  'SHOWER CURTAIN': 'CORTINA DE BAÑO',
  'CUTTING BOARD': 'TABLA DE CORTAR',
  'FRYING PAN': 'SARTÉN',
  'COFFEE MUG': 'TAZA DE CAFÉ',
  'WINE GLASS': 'COPA DE VINO',
  'LED LIGHT': 'LUZ LED',
  'LED LIGHTS': 'LUCES LED',
  'FAIRY LIGHTS': 'LUCES DECORATIVAS',
  'PACKING TAPE': 'CINTA DE EMBALAJE',
  'DUCT TAPE': 'CINTA ADHESIVA',
  'EXTENSION CORD': 'CABLE DE EXTENSIÓN',
  'SURGE PROTECTOR': 'PROTECTOR DE VOLTAJE',
  'CAR CHARGER': 'CARGADOR DE AUTO',
  'WALL CHARGER': 'CARGADOR DE PARED',
  'WIRELESS CHARGER': 'CARGADOR INALÁMBRICO',
  'EAR BUDS': 'AUDÍFONOS',
  'EARBUDS': 'AUDÍFONOS',
  'EAR PODS': 'AUDÍFONOS',
  'HEAD PHONES': 'AUDÍFONOS',
  'HEADPHONES': 'AUDÍFONOS',
  'BLUETOOTH SPEAKER': 'BOCINA BLUETOOTH',
  'PORTABLE SPEAKER': 'BOCINA PORTÁTIL',
};

const WORD_MAP: Record<string, string> = {
  // Electronics
  'PHONE': 'TELÉFONO', 'LAPTOP': 'LAPTOP', 'TABLET': 'TABLETA',
  'COMPUTER': 'COMPUTADORA', 'CHARGER': 'CARGADOR', 'CABLE': 'CABLE',
  'ADAPTER': 'ADAPTADOR', 'BATTERY': 'BATERÍA', 'SPEAKER': 'BOCINA',
  'CAMERA': 'CÁMARA', 'MONITOR': 'MONITOR', 'KEYBOARD': 'TECLADO',
  'MOUSE': 'RATÓN', 'PRINTER': 'IMPRESORA', 'SCANNER': 'ESCÁNER',
  'ROUTER': 'ROUTER', 'MODEM': 'MODEM', 'MICROPHONE': 'MICRÓFONO',
  'HEADSET': 'AUDÍFONOS', 'CONTROLLER': 'CONTROL', 'CONSOLE': 'CONSOLA',
  'REMOTE': 'CONTROL REMOTO', 'STYLUS': 'LÁPIZ DIGITAL',
  'TRIPOD': 'TRÍPODE', 'DRONE': 'DRON', 'PROJECTOR': 'PROYECTOR',
  // Clothing
  'SHIRT': 'CAMISA', 'T-SHIRT': 'CAMISETA', 'TSHIRT': 'CAMISETA',
  'PANTS': 'PANTALONES', 'JEANS': 'JEANS', 'DRESS': 'VESTIDO',
  'JACKET': 'CHAQUETA', 'COAT': 'ABRIGO', 'SWEATER': 'SUÉTER',
  'HOODIE': 'SUDADERA', 'SHORTS': 'PANTALONES CORTOS', 'SKIRT': 'FALDA',
  'BLOUSE': 'BLUSA', 'SUIT': 'TRAJE', 'VEST': 'CHALECO',
  'LEGGINGS': 'LEGGINGS', 'PAJAMAS': 'PIJAMAS', 'ROBE': 'BATA',
  'UNIFORM': 'UNIFORME', 'COSTUME': 'DISFRAZ', 'SCARF': 'BUFANDA',
  'GLOVES': 'GUANTES', 'TIE': 'CORBATA', 'APRON': 'DELANTAL',
  // Underwear
  'UNDERWEAR': 'ROPA INTERIOR', 'BRAS': 'SOSTENES', 'BRA': 'SOSTÉN',
  'SOCKS': 'CALCETINES', 'BOXERS': 'BÓXERS', 'BRIEFS': 'CALZONCILLOS',
  'PANTIES': 'PANTALETAS', 'THONG': 'TANGA',
  // Shoes
  'SHOES': 'ZAPATOS', 'SNEAKERS': 'TENIS', 'BOOTS': 'BOTAS',
  'SANDALS': 'SANDALIAS', 'HEELS': 'TACONES', 'FLATS': 'ZAPATOS BAJOS',
  'SLIPPERS': 'PANTUFLAS', 'LOAFERS': 'MOCASINES', 'CLEATS': 'TACOS',
  // Accessories
  'WATCH': 'RELOJ', 'WATCHES': 'RELOJES', 'SUNGLASSES': 'LENTES DE SOL',
  'GLASSES': 'LENTES', 'BELT': 'CINTURÓN', 'BELTS': 'CINTURONES',
  'WALLET': 'CARTERA', 'PURSE': 'BOLSO', 'BAG': 'BOLSA',
  'BAGS': 'BOLSAS', 'BACKPACK': 'MOCHILA', 'HAT': 'SOMBRERO',
  'HATS': 'SOMBREROS', 'CAP': 'GORRA', 'JEWELRY': 'JOYERÍA',
  'NECKLACE': 'COLLAR', 'BRACELET': 'PULSERA', 'EARRINGS': 'ARETES',
  'RING': 'ANILLO', 'RINGS': 'ANILLOS', 'PENDANT': 'DIJE',
  'CHAIN': 'CADENA', 'CHAINS': 'CADENAS', 'BROOCH': 'BROCHE',
  // Home & Kitchen
  'PILLOW': 'ALMOHADA', 'BLANKET': 'COBIJA', 'TOWEL': 'TOALLA',
  'TOWELS': 'TOALLAS', 'CURTAIN': 'CORTINA', 'CURTAINS': 'CORTINAS',
  'RUG': 'ALFOMBRA', 'MAT': 'TAPETE', 'LAMP': 'LÁMPARA',
  'CANDLE': 'VELA', 'CANDLES': 'VELAS', 'PLATE': 'PLATO',
  'PLATES': 'PLATOS', 'CUP': 'TAZA', 'CUPS': 'TAZAS',
  'BOWL': 'TAZÓN', 'BOWLS': 'TAZONES', 'POT': 'OLLA',
  'PAN': 'SARTÉN', 'UTENSILS': 'UTENSILIOS', 'KNIFE': 'CUCHILLO',
  'KNIVES': 'CUCHILLOS', 'FORK': 'TENEDOR', 'SPOON': 'CUCHARA',
  'CONTAINER': 'RECIPIENTE', 'ORGANIZER': 'ORGANIZADOR', 'SHELF': 'ESTANTE',
  'BASKET': 'CANASTA', 'VASE': 'FLORERO', 'FRAME': 'MARCO',
  'MIRROR': 'ESPEJO', 'CLOCK': 'RELOJ', 'THERMOMETER': 'TERMÓMETRO',
  'FAN': 'VENTILADOR', 'IRON': 'PLANCHA', 'BLENDER': 'LICUADORA',
  'MIXER': 'BATIDORA', 'TOASTER': 'TOSTADORA',
  // Beauty & Cosmetics
  'LIPSTICK': 'LABIAL', 'FOUNDATION': 'BASE', 'MASCARA': 'RÍMEL',
  'PERFUME': 'PERFUME', 'COLOGNE': 'COLONIA', 'LOTION': 'LOCIÓN',
  'CREAM': 'CREMA', 'SHAMPOO': 'CHAMPÚ', 'CONDITIONER': 'ACONDICIONADOR',
  'SOAP': 'JABÓN', 'BRUSH': 'CEPILLO', 'BRUSHES': 'CEPILLOS',
  'DEODORANT': 'DESODORANTE', 'SUNSCREEN': 'PROTECTOR SOLAR',
  'MOISTURIZER': 'HUMECTANTE', 'SERUM': 'SÉRUM', 'TONER': 'TÓNICO',
  'CLEANSER': 'LIMPIADOR', 'EXFOLIATOR': 'EXFOLIANTE',
  // Toys & Games
  'TOY': 'JUGUETE', 'TOYS': 'JUGUETES', 'DOLL': 'MUÑECA',
  'DOLLS': 'MUÑECAS', 'PUZZLE': 'ROMPECABEZAS', 'GAME': 'JUEGO',
  'GAMES': 'JUEGOS', 'BALL': 'PELOTA', 'BLOCKS': 'BLOQUES',
  'CARDS': 'CARTAS', 'DICE': 'DADOS', 'STICKERS': 'CALCOMANÍAS',
  // Food & Drinks
  'CHOCOLATE': 'CHOCOLATE', 'CANDY': 'DULCES', 'SNACKS': 'BOCADILLOS',
  'COFFEE': 'CAFÉ', 'TEA': 'TÉ', 'SPICES': 'ESPECIAS',
  'SAUCE': 'SALSA', 'CEREAL': 'CEREAL', 'COOKIES': 'GALLETAS',
  'VITAMINS': 'VITAMINAS', 'SUPPLEMENTS': 'SUPLEMENTOS',
  'PROTEIN': 'PROTEÍNA',
  // Tools & Hardware
  'TOOLS': 'HERRAMIENTAS', 'TOOL': 'HERRAMIENTA', 'DRILL': 'TALADRO',
  'HAMMER': 'MARTILLO', 'SCREWDRIVER': 'DESTORNILLADOR', 'WRENCH': 'LLAVE',
  'PLIERS': 'PINZAS', 'TAPE': 'CINTA', 'GLUE': 'PEGAMENTO',
  'SCISSORS': 'TIJERAS', 'MEASURING': 'MEDICIÓN', 'LEVEL': 'NIVEL',
  // Materials / Adjectives
  'COTTON': 'ALGODÓN', 'LEATHER': 'CUERO', 'PLASTIC': 'PLÁSTICO',
  'METAL': 'METAL', 'RUBBER': 'CAUCHO', 'WOODEN': 'MADERA',
  'WOOD': 'MADERA', 'GLASS': 'VIDRIO', 'CERAMIC': 'CERÁMICA',
  'SILK': 'SEDA', 'WOOL': 'LANA', 'NYLON': 'NYLON', 'LINEN': 'LINO',
  'VELVET': 'TERCIOPELO', 'DENIM': 'MEZCLILLA', 'POLYESTER': 'POLIÉSTER',
  'PORTABLE': 'PORTÁTIL', 'WIRELESS': 'INALÁMBRICO', 'WATERPROOF': 'IMPERMEABLE',
  'RECHARGEABLE': 'RECARGABLE', 'ADJUSTABLE': 'AJUSTABLE', 'FOLDABLE': 'PLEGABLE',
  'MAGNETIC': 'MAGNÉTICO', 'AUTOMATIC': 'AUTOMÁTICO', 'DIGITAL': 'DIGITAL',
  'ELECTRIC': 'ELÉCTRICO', 'ELECTRONIC': 'ELECTRÓNICO',
  'MINI': 'MINI', 'LARGE': 'GRANDE', 'SMALL': 'PEQUEÑO', 'MEDIUM': 'MEDIANO',
  // General terms
  'SET': 'SET', 'PACK': 'PAQUETE', 'PAIR': 'PAR', 'PIECE': 'PIEZA',
  'PIECES': 'PIEZAS', 'BOX': 'CAJA', 'KIT': 'KIT', 'CASE': 'FUNDA',
  'COVER': 'FUNDA', 'HOLDER': 'SOPORTE', 'STAND': 'SOPORTE',
  'MOUNT': 'MONTAJE', 'RACK': 'ESTANTE', 'HOOK': 'GANCHO',
  'STRAP': 'CORREA', 'BAND': 'BANDA', 'CLIP': 'CLIP',
  // People / Sizes
  'MEN': 'HOMBRES', "MEN'S": 'DE HOMBRE', 'WOMEN': 'MUJERES',
  "WOMEN'S": 'DE MUJER', 'KIDS': 'NIÑOS', "KID'S": 'DE NIÑO',
  'CHILDREN': 'NIÑOS', "CHILDREN'S": 'DE NIÑOS',
  'BABY': 'BEBÉ', 'INFANT': 'INFANTIL', 'TODDLER': 'NIÑO PEQUEÑO',
  'BOYS': 'NIÑOS', 'GIRLS': 'NIÑAS', 'UNISEX': 'UNISEX',
  // Colors
  'BLACK': 'NEGRO', 'WHITE': 'BLANCO', 'RED': 'ROJO', 'BLUE': 'AZUL',
  'GREEN': 'VERDE', 'YELLOW': 'AMARILLO', 'PINK': 'ROSA',
  'PURPLE': 'MORADO', 'ORANGE': 'NARANJA', 'BROWN': 'CAFÉ',
  'GRAY': 'GRIS', 'GREY': 'GRIS', 'GOLD': 'DORADO', 'SILVER': 'PLATEADO',
  'BEIGE': 'BEIGE', 'NAVY': 'AZUL MARINO', 'TEAL': 'VERDE AZULADO',
  // Misc
  'NEW': 'NUEVO', 'USED': 'USADO', 'REPLACEMENT': 'REPUESTO',
  'ACCESSORIES': 'ACCESORIOS', 'ACCESSORY': 'ACCESORIO',
  'ELECTRONICS': 'ELECTRÓNICOS', 'CLOTHING': 'ROPA',
  'COSMETICS': 'COSMÉTICOS', 'FOOD': 'ALIMENTOS',
  'BOOKS': 'LIBROS', 'BOOK': 'LIBRO', 'MEDICINE': 'MEDICINA',
  'SIZE': 'TALLA', 'COLOR': 'COLOR', 'STYLE': 'ESTILO',
  'TYPE': 'TIPO', 'MODEL': 'MODELO', 'BRAND': 'MARCA',
  'WITH': 'CON', 'FOR': 'PARA', 'AND': 'Y', 'OR': 'O',
  'THE': 'EL', 'OF': 'DE', 'IN': 'EN',
};

// Sort phrases longest-first for greedy matching
const SORTED_PHRASES = Object.keys(PHRASE_MAP).sort((a, b) => b.length - a.length);

// Words to filter out of descriptions (inappropriate for customs forms)
const FLAGGED_WORDS = new Set(['SEXY', 'EROTIC', 'ADULT', 'SENSUAL', 'PROVOCATIVE', 'SEDUCTIVE',
  'LENCERÍA', 'LENCERIA', 'ÍNTIMO', 'INTIMO', 'INTIMATE', 'LINGERIE', 'THONG', 'TANGA']);

/** Strip flagged words from any description (customs or fallback) */
const filterFlaggedWords = (text: string): string => {
  let result = text;
  for (const word of FLAGGED_WORDS) {
    result = result.replace(new RegExp(`\\b${word}\\b`, 'gi'), '');
  }
  return result.replace(/\s{2,}/g, ' ').trim();
};

/**
 * Translate an item description from English to Spanish.
 * Uses phrase matching first (longest match wins), then word-by-word.
 * Brand names, numbers, and unrecognized words pass through unchanged.
 */
const translateToSpanish = (text: string): string => {
  let upper = text.toUpperCase();

  // Filter out flagged words
  for (const word of FLAGGED_WORDS) {
    upper = upper.replace(new RegExp(`\\b${word}\\b`, 'g'), '');
  }
  upper = upper.replace(/\s{2,}/g, ' ').trim();

  // Phase 1: Replace known multi-word phrases
  for (const phrase of SORTED_PHRASES) {
    const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    upper = upper.replace(regex, PHRASE_MAP[phrase]);
  }

  // Phase 2: Replace remaining individual English words
  upper = upper.replace(/[A-ZÀ-Ú'-]+/g, (word) => WORD_MAP[word] || word);

  // Convert to title case (capitalize first letter of each word)
  const titleCase = upper.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());

  // Truncate to max 5 words — customs needs short descriptions, not marketing copy
  const words = titleCase.split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(' ');
};

// ── Data structures ──────────────────────────────────────────────────────────

interface CustomerBlock {
  consignee: string;
  packageNumber: string;
  items: { quantity: number; description: string; unitValue: number; totalValue: number }[];
  totalQuantity: number;
  totalValue: number;
}

// ── Build customer blocks from orders ────────────────────────────────────────

const buildCustomerBlocks = (orders: OrderRow[]): CustomerBlock[] => {
  const sorted = [...orders].sort((a, b) => {
    const nameA = (a.consignee || '').toLowerCase().trim();
    const nameB = (b.consignee || '').toLowerCase().trim();
    return nameA.localeCompare(nameB);
  });

  return sorted.map((order) => {
    // Keep the original package identifier from the Machote — could be a pure number
    // ("5"), a warehouse code ("W12345"), or anything else Julio uses for control interno.
    // Strip only the "Paquete #" prefix; preserve whatever identifier follows.
    const pkgNum = (order.packageNumber || '')
      .replace(/^Paquete\s*#?\s*/i, '')
      .trim() || '0';

    if (!order.items || order.items.length === 0) {
      return {
        consignee: (order.consignee || '').trim().toUpperCase(),
        packageNumber: pkgNum,
        items: [{
          quantity: order.pieces || 0,
          description: 'NO ITEM DETAILS',
          unitValue: order.value || 0,
          totalValue: order.value || 0,
        }],
        totalQuantity: order.pieces || 0,
        totalValue: order.value || 0,
      };
    }

    const items = order.items.map(item => ({
      quantity: item.quantity || 0,
      description: filterFlaggedWords(item.customsDescription || translateToSpanish(item.name || 'Item')),
      unitValue: item.unitValue || 0,
      totalValue: item.totalValue || 0,
    }));

    const itemsTotal = order.items.reduce((sum, item) => sum + (item.totalValue || 0), 0);
    const totalItemQuantity = order.items.reduce((sum, item) => sum + (item.quantity || 0), 0);

    const totalQuantity = (order.pieces && order.pieces !== totalItemQuantity)
      ? order.pieces
      : totalItemQuantity;

    // Per-customer total = sum of extracted line items. The Desarrollo grand total must
    // equal the sum of every item across every screenshot — never trust an upstream
    // OCR/manual total here. (order.value is kept for sanity-check / display only.)
    const totalValue = itemsTotal;

    return {
      consignee: (order.consignee || '').trim().toUpperCase(),
      packageNumber: pkgNum,
      items,
      totalQuantity,
      totalValue,
    };
  });
};

// ── Pagination ───────────────────────────────────────────────────────────────

const customerRowCount = (block: CustomerBlock): number =>
  block.items.length + 1 + 1; // items + TOTAL row + blank separator

const paginateCustomers = (blocks: CustomerBlock[]): CustomerBlock[][] => {
  const pages: CustomerBlock[][] = [];
  let currentPage: CustomerBlock[] = [];
  let currentPageRows = 0;

  for (const block of blocks) {
    const rows = customerRowCount(block);
    if (currentPageRows + rows > GRID_ROWS_PER_PAGE && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [];
      currentPageRows = 0;
    }
    currentPage.push(block);
    currentPageRows += rows;
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
};

// ── Google Sheets cell helpers ───────────────────────────────────────────────

const makeCell = (opts?: {
  value?: string | number;
  formula?: string;
  bold?: boolean;
  hAlign?: string;
  vAlign?: string;
  borders?: Record<string, typeof SOLID_BLACK>;
  numberFormat?: typeof CURRENCY_FORMAT;
  wrapText?: boolean;
  clip?: boolean;
  textRotation?: number;
}): Record<string, unknown> => {
  if (!opts) return {};

  const cell: Record<string, unknown> = {};
  const fmt: Record<string, unknown> = {};

  // Value
  if (opts.formula) {
    cell.userEnteredValue = { formulaValue: opts.formula };
  } else if (typeof opts.value === 'number') {
    cell.userEnteredValue = { numberValue: opts.value };
  } else if (opts.value !== undefined) {
    cell.userEnteredValue = { stringValue: opts.value };
  }

  // Font
  fmt.textFormat = opts.bold ? { ...FONT_BOLD } : { ...FONT_NORMAL };

  // Alignment
  fmt.horizontalAlignment = opts.hAlign || 'LEFT';
  fmt.verticalAlignment = opts.vAlign || 'BOTTOM';
  if (opts.wrapText) fmt.wrapStrategy = 'WRAP';
  else if (opts.clip) fmt.wrapStrategy = 'CLIP';
  if (opts.textRotation) fmt.textRotation = { angle: opts.textRotation };

  // Borders
  if (opts.borders) fmt.borders = opts.borders;

  // Number format
  if (opts.numberFormat) fmt.numberFormat = opts.numberFormat;

  cell.userEnteredFormat = fmt;
  return cell;
};

const emptyRow = (): Record<string, unknown> => ({
  values: Array.from({ length: 11 }, () => ({})),
});

const makeRow = (cells: Record<number, Record<string, unknown>>): Record<string, unknown> => {
  const values: Record<string, unknown>[] = [];
  for (let col = 0; col < 11; col++) {
    values.push(cells[col] || {});
  }
  return { values };
};

const emptyGridRow = (): Record<string, unknown> => {
  const cells: Record<number, Record<string, unknown>> = {};
  for (let col = 2; col <= 10; col++) {
    cells[col] = makeCell({ borders: ALL_BORDERS });
  }
  return makeRow(cells);
};

// ── Write column headers (every page) ────────────────────────────────────────

const writeHeaders = (
  rows: Record<string, unknown>[],
  merges: Record<string, unknown>[],
  currentRow: number,
  sheetId: number,
): number => {
  const startRow = currentRow;
  const topOnly = { top: SOLID_BLACK, left: SOLID_BLACK, right: SOLID_BLACK };
  const bottomOnly = { bottom: SOLID_BLACK, left: SOLID_BLACK, right: SOLID_BLACK };

  // Row 1: main headers (merged vertically with row 2 for most columns)
  rows.push(makeRow({
    2: makeCell({ value: 'Consignatario Persona Natural', bold: true, hAlign: 'CENTER', vAlign: 'MIDDLE', wrapText: true, borders: topOnly }),
    3: makeCell({ value: 'No de PK', bold: true, hAlign: 'CENTER', vAlign: 'MIDDLE', wrapText: true, borders: topOnly }),
    4: makeCell({ value: 'Cant.', bold: true, hAlign: 'CENTER', vAlign: 'MIDDLE', wrapText: true, borders: topOnly, textRotation: 90 }),
    5: makeCell({ value: 'Descripcion', bold: true, hAlign: 'CENTER', vAlign: 'MIDDLE', wrapText: true, borders: topOnly }),
    6: makeCell({ value: 'Mercancias', bold: true, hAlign: 'CENTER', vAlign: 'MIDDLE', borders: { left: SOLID_BLACK, top: SOLID_BLACK, bottom: SOLID_BLACK } }),
    7: makeCell({ borders: { right: SOLID_BLACK, top: SOLID_BLACK, bottom: SOLID_BLACK } }),
    8: makeCell({ value: 'Valor Unit. $', bold: true, hAlign: 'CENTER', vAlign: 'MIDDLE', wrapText: true, borders: topOnly }),
    9: makeCell({ value: 'Total', bold: true, hAlign: 'CENTER', vAlign: 'MIDDLE', wrapText: true, borders: topOnly }),
    10: makeCell({ value: 'IVA o 30%', bold: true, hAlign: 'CENTER', vAlign: 'MIDDLE', wrapText: true, borders: topOnly }),
  }));
  currentRow++;

  // Row 2: sub-headers (Usado / Nuevo) + bottom borders on merged cells
  rows.push(makeRow({
    2: makeCell({ borders: bottomOnly }),
    3: makeCell({ borders: bottomOnly }),
    4: makeCell({ borders: bottomOnly }),
    5: makeCell({ borders: bottomOnly }),
    6: makeCell({ value: 'Usado', hAlign: 'CENTER', wrapText: true, borders: ALL_BORDERS }),
    7: makeCell({ value: 'Nuevo', hAlign: 'CENTER', wrapText: true, borders: ALL_BORDERS }),
    8: makeCell({ borders: bottomOnly }),
    9: makeCell({ borders: bottomOnly }),
    10: makeCell({ borders: bottomOnly }),
  }));
  currentRow++;

  // Vertical merges for C, D, E, F, I, J, K
  for (const col of [2, 3, 4, 5, 8, 9, 10]) {
    merges.push({
      sheetId,
      startRowIndex: startRow,
      endRowIndex: startRow + 2,
      startColumnIndex: col,
      endColumnIndex: col + 1,
    });
  }

  // Horizontal merge G+H on row 1
  merges.push({
    sheetId,
    startRowIndex: startRow,
    endRowIndex: startRow + 1,
    startColumnIndex: 6,
    endColumnIndex: 8,
  });

  return currentRow;
};

// ── Build rows for a single page/sheet ───────────────────────────────────────

interface PageData {
  rows: Record<string, unknown>[];
  merges: Record<string, unknown>[];
}

interface ExportProfile {
  gestorNumber?: string;
  displayName?: string;
}

const buildPageData = (
  page: CustomerBlock[],
  pageIndex: number,
  totalPages: number,
  sheetId: number,
  allSheetNames: string[],
  profile?: ExportProfile,
  grandTotalValue?: number,
): PageData => {
  const gestorLabel = profile?.gestorNumber
    ? `Gestor ${profile.gestorNumber}`
    : 'Gestor';
  const rows: Record<string, unknown>[] = [];
  const merges: Record<string, unknown>[] = [];
  const isLastPage = pageIndex === totalPages - 1;

  const r1 = (idx: number) => idx + 1; // 0-indexed → A1 row number

  let currentRow = 0;

  // ── Title block (7 rows) ─────────────────────────────────────────────

  // Row 1: registro + Gestor
  rows.push(makeRow({
    2: makeCell({ value: 'No. de registro de mercancías:' }),
    9: makeCell({ value: gestorLabel }),
  }));
  currentRow++;

  // Row 2: codigo + hojas
  rows.push(makeRow({
    2: makeCell({ value: 'Codigo de aduana: 3' }),
    9: makeCell({ value: `No. de hojas ${pageIndex + 1} de ${totalPages}` }),
  }));
  currentRow++;

  // Row 3: blank
  rows.push(emptyRow());
  currentRow++;

  // Row 4: DIRECCIÓN (centered in F)
  rows.push(makeRow({
    5: makeCell({ value: 'DIRECCIÓN GENERAL DE ADUANAS', bold: true, hAlign: 'CENTER' }),
  }));
  currentRow++;

  // Row 5: DIVISIÓN (centered in F)
  rows.push(makeRow({
    5: makeCell({ value: 'DIVISIÓN DE OPERACIONES', bold: true, hAlign: 'CENTER' }),
  }));
  currentRow++;

  // Row 6: blank
  rows.push(emptyRow());
  currentRow++;

  // Row 7: ANEXO (centered)
  rows.push(makeRow({
    5: makeCell({
      value: 'ANEXO A LA DECLARACIÓN DE MERCANCÍAS PARA PEQUEÑOS ENVÍOS Y DECLARACIÓN DE EQUIPAJE',
      bold: true,
      hAlign: 'CENTER',
    }),
  }));
  currentRow++;

  // Row 8: blank between title and headers
  rows.push(emptyRow());
  currentRow++;

  // ── Column headers (2 rows) ──────────────────────────────────────────

  currentRow = writeHeaders(rows, merges, currentRow, sheetId);

  // ── Customer data rows ───────────────────────────────────────────────

  let dataRowsWritten = 0;
  const customerTotalJRows: number[] = [];

  for (const block of page) {
    const firstItemRow = currentRow;

    for (let i = 0; i < block.items.length; i++) {
      const item = block.items[i];
      const cells: Record<number, Record<string, unknown>> = {};

      if (i === 0) {
        cells[2] = makeCell({ value: block.consignee, borders: ALL_BORDERS });
        cells[3] = makeCell({ value: block.packageNumber, bold: true, borders: ALL_BORDERS });
      } else {
        cells[2] = makeCell({ borders: ALL_BORDERS });
        cells[3] = makeCell({ borders: ALL_BORDERS });
      }

      cells[4] = makeCell({ value: item.quantity, borders: ALL_BORDERS });
      cells[5] = makeCell({ value: item.description, borders: ALL_BORDERS, clip: true });
      cells[6] = makeCell({ borders: ALL_BORDERS });
      cells[7] = makeCell({ value: 'X', borders: ALL_BORDERS });
      cells[8] = makeCell({ value: item.unitValue, borders: ALL_BORDERS, numberFormat: CURRENCY_FORMAT });
      cells[9] = makeCell({ value: item.totalValue, borders: ALL_BORDERS, numberFormat: CURRENCY_FORMAT });
      cells[10] = makeCell({ borders: ALL_BORDERS });

      rows.push(makeRow(cells));
      currentRow++;
      dataRowsWritten++;
    }

    const lastItemRow = currentRow - 1;

    // TOTAL row
    const totalCells: Record<number, Record<string, unknown>> = {
      2: makeCell({ borders: ALL_BORDERS }),
      3: makeCell({ borders: ALL_BORDERS }),
      4: makeCell({ formula: `=SUM(E${firstItemRow + 1}:E${currentRow})`, bold: true, borders: ALL_BORDERS }),
      5: makeCell({ borders: ALL_BORDERS }),
      6: makeCell({ borders: ALL_BORDERS }),
      7: makeCell({ borders: ALL_BORDERS }),
      8: makeCell({ value: 'TOTAL', bold: true, borders: ALL_BORDERS }),
      10: makeCell({ borders: ALL_BORDERS }),
    };

    // SUM formula so the displayed total always matches the displayed item values.
    totalCells[9] = makeCell({
      formula: `=SUM(J${firstItemRow + 1}:J${currentRow})`,
      bold: true, borders: ALL_BORDERS, numberFormat: CURRENCY_FORMAT,
    });

    rows.push(makeRow(totalCells));
    customerTotalJRows.push(currentRow);
    currentRow++;
    dataRowsWritten++;

    // Blank separator
    rows.push(emptyGridRow());
    currentRow++;
    dataRowsWritten++;
  }

  // ── Pad remaining grid space with empty bordered rows ────────────────

  while (dataRowsWritten < GRID_ROWS_PER_PAGE) {
    rows.push(emptyGridRow());
    currentRow++;
    dataRowsWritten++;
  }

  // ── SUBTOTAL row ─────────────────────────────────────────────────────

  const subtotalFormula = customerTotalJRows.length > 0
    ? customerTotalJRows.map(r => `J${r1(r)}`).join('+')
    : '0';

  rows.push(makeRow({
    2: makeCell({ borders: ALL_BORDERS }),
    3: makeCell({ borders: ALL_BORDERS }),
    4: makeCell({ borders: ALL_BORDERS }),
    5: makeCell({ borders: ALL_BORDERS }),
    6: makeCell({ borders: ALL_BORDERS }),
    7: makeCell({
      value: 'SUBTOTAL', bold: true,
      borders: ALL_BORDERS,
    }),
    8: makeCell({ value: 'SUBTOTAL', bold: true, borders: ALL_BORDERS }),
    9: makeCell({
      formula: `=${subtotalFormula}`, bold: true,
      borders: ALL_BORDERS,
      numberFormat: CURRENCY_FORMAT,
    }),
    10: makeCell({ borders: ALL_BORDERS }),
  }));
  currentRow++;

  // ── Grand TOTAL (last page, multi-page only) ─────────────────────────

  if (isLastPage && totalPages > 1) {
    // Multi-sheet grand TOTAL: written as a STATIC value (pre-summed at export time)
    // rather than a cross-sheet formula like `='Hoja 1'!J64+'Hoja 2'!J64+...`. Reason:
    // cross-sheet references are the part most likely to break when the customer
    // downloads the Google Sheet as xlsx and opens it in Excel. Per-sheet subtotals
    // and per-customer totals stay as formulas (single-sheet ranges always survive).
    void allSheetNames;
    void SUBTOTAL_ROW_A1;

    rows.push(makeRow({
      8: makeCell({
        value: 'TOTAL', bold: true,
        borders: { left: SOLID_BLACK, top: SOLID_BLACK, bottom: SOLID_BLACK },
      }),
      9: makeCell({
        value: grandTotalValue ?? 0,
        bold: true,
        borders: { right: SOLID_BLACK, top: SOLID_BLACK, bottom: SOLID_BLACK },
        numberFormat: CURRENCY_FORMAT,
      }),
    }));
    currentRow++;
  }

  // ── Signature block (blank + name + underscores + labels) ────────────
  //
  // Layout (both sides symmetric, Firma side blank for handwritten signature):
  //   row N:    (blank)            (blank)
  //   row N+1:  Jamari McNabb      (blank)        ← printed name above Nombre line
  //   row N+2:  __________         __________     ← signature lines
  //   row N+3:  Nombre             Firma          ← labels

  rows.push(emptyRow());
  currentRow++;

  const displayName = profile?.displayName?.trim() || '';
  rows.push(makeRow({
    2: makeCell({ value: displayName }),
    8: makeCell({ value: '' }),
  }));
  currentRow++;

  rows.push(makeRow({
    2: makeCell({ value: '____________________' }),
    8: makeCell({ value: '____________________' }),
  }));
  currentRow++;

  rows.push(makeRow({
    2: makeCell({ value: 'Nombre' }),
    8: makeCell({ value: 'Firma' }),
  }));
  currentRow++;

  return { rows, merges };
};

// ── Build batchUpdate requests for all sheets ────────────────────────────────

const buildAllRequests = (
  pageDataArray: PageData[],
): Record<string, unknown>[] => {
  const requests: Record<string, unknown>[] = [];

  for (let i = 0; i < pageDataArray.length; i++) {
    const { rows, merges } = pageDataArray[i];
    const sheetId = i;

    // Hide gridlines
    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { hideGridlines: true },
        },
        fields: 'gridProperties.hideGridlines',
      },
    });

    // Column widths
    for (const [colStr, widthPx] of Object.entries(COLUMN_WIDTHS_PX)) {
      const col = Number(colStr);
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 },
          properties: { pixelSize: widthPx },
          fields: 'pixelSize',
        },
      });
    }

    // Row heights
    if (rows.length > 0) {
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: rows.length },
          properties: { pixelSize: ROW_HEIGHT_PX },
          fields: 'pixelSize',
        },
      });
    }

    // Cell data + formatting
    requests.push({
      updateCells: {
        start: { sheetId, rowIndex: 0, columnIndex: 0 },
        rows,
        fields: 'userEnteredValue,userEnteredFormat',
      },
    });

    // Merges
    for (const merge of merges) {
      requests.push({ mergeCells: { range: merge, mergeType: 'MERGE_ALL' } });
    }
  }

  return requests;
};

// ── Create spreadsheet via Sheets API ────────────────────────────────────────

const createSpreadsheet = async (
  accessToken: string,
  title: string,
  sheetNames: string[],
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> => {
  const sheets = sheetNames.map((name, i) => ({
    properties: { sheetId: i, title: name },
  }));

  const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to create spreadsheet');
  }

  const data = await response.json();
  return { spreadsheetId: data.spreadsheetId, spreadsheetUrl: data.spreadsheetUrl };
};

// ── Share file so "anyone with the link" can view ───────────────────────────

const shareFileWithLink = async (
  fileId: string,
  accessToken: string,
  userEmail?: string,
): Promise<void> => {
  const postPermission = async (body: Record<string, unknown>): Promise<Response> => {
    return fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}/permissions?supportsAllDrives=true&sendNotificationEmail=false`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
  };

  // 1. Explicit per-user share — the reliable path. Works even if the org's Drive policy
  //    blocks anyone-with-link, AND it puts the Sheet in the user's "Shared with me" view.
  let userShareOk = false;
  if (userEmail) {
    const resp = await postPermission({
      role: 'writer',
      type: 'user',
      emailAddress: userEmail,
    });
    if (resp.ok) {
      userShareOk = true;
    } else {
      const body = await resp.text().catch(() => '');
      console.warn(`Per-user share to ${userEmail} failed (${resp.status}):`, body.slice(0, 300));
    }
  }

  // 2. Anyone-with-link — nice-to-have for forwarding without inviting each recipient.
  //    Try writer, fall back to reader if org policy blocks anyone-as-writer.
  let anyoneShareOk = false;
  const writerResp = await postPermission({ role: 'writer', type: 'anyone', allowFileDiscovery: false });
  if (writerResp.ok) {
    anyoneShareOk = true;
  } else {
    const readerResp = await postPermission({ role: 'reader', type: 'anyone', allowFileDiscovery: false });
    if (readerResp.ok) {
      anyoneShareOk = true;
    } else {
      const body = await readerResp.text().catch(() => '');
      console.warn(`Anyone-with-link share failed (${readerResp.status}):`, body.slice(0, 300));
    }
  }

  if (!userShareOk && !anyoneShareOk) {
    throw new Error(
      `Could not share the Sheet — neither per-user nor anyone-with-link permissions stuck. ` +
      `Check that the connected Google account in Settings has Drive sharing enabled.`,
    );
  }
};

// ── Move file to Drive folder ────────────────────────────────────────────────

const moveToFolder = async (
  fileId: string,
  folderId: string,
  accessToken: string,
): Promise<void> => {
  await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${folderId}`,
    { method: 'PATCH', headers: { Authorization: `Bearer ${accessToken}` } },
  );
};

// ── Main export function ─────────────────────────────────────────────────────

export const exportOrdersToGoogleSheet = async (
  orders: OrderRow[],
  organizationId: string,
  exportedBy?: string,
  profile?: ExportProfile,
  userEmail?: string,
): Promise<{ success: boolean; sheetUrl?: string; error?: string }> => {
  try {
    if (!orders || orders.length === 0) {
      return { success: false, error: 'No orders to export' };
    }

    const blocks = buildCustomerBlocks(orders);
    const pages = paginateCustomers(blocks);

    console.log(
      `Desarrollo export: ${orders.length} orders → ${blocks.length} customers → ${pages.length} page(s)`,
    );

    const accessToken = await getValidAccessToken(organizationId);

    const timestamp = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).replace(/\//g, '-');

    // Sheet tab names: "Hoja 1", "Hoja 2", ... (or just "CONTROL" for single page)
    const sheetNames = pages.length === 1
      ? ['CONTROL']
      : pages.map((_, i) => `Hoja ${i + 1}`);

    const title = `Desarrollo_Export_${timestamp}_${orders.length}orders`;
    const { spreadsheetId, spreadsheetUrl } = await createSpreadsheet(accessToken, title, sheetNames);
    console.log('✓ Spreadsheet created:', spreadsheetId);

    // Build page data for each sheet. Grand total is pre-computed from line items so
    // it survives the Google Sheets → xlsx → Excel pipeline without relying on
    // cross-sheet formula references.
    const grandTotalValue = blocks.reduce((sum, b) => sum + b.totalValue, 0);
    const pageDataArray: PageData[] = pages.map((page, i) =>
      buildPageData(page, i, pages.length, i, sheetNames, profile, grandTotalValue),
    );

    const requests = buildAllRequests(pageDataArray);

    const batchResponse = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests }),
      },
    );

    if (!batchResponse.ok) {
      const error = await batchResponse.json();
      console.error('batchUpdate failed:', error);
      throw new Error(error.error?.message || 'Failed to format spreadsheet');
    }

    console.log('✓ Spreadsheet formatted');

    // Share — explicit per-user grant (most reliable, survives org Drive policies)
    // PLUS anyone-with-link as a nice-to-have for forwarding.
    await shareFileWithLink(spreadsheetId, accessToken, userEmail);
    console.log('✓ Sharing permissions set');

    // Move to Drive folder
    const orgRef = doc(db, 'organizations', organizationId);
    const orgSnap = await getDoc(orgRef);
    const org = orgSnap.data() as Organization;

    if (org.googleDriveFolderId) {
      await moveToFolder(spreadsheetId, org.googleDriveFolderId, accessToken);
      console.log('✓ Moved to Drive folder');
    }

    // Track in Firestore
    try {
      await addDoc(collection(db, 'exportHistory'), {
        spreadsheetId, sheetUrl: spreadsheetUrl, organizationId,
        organizationName: org.organizationName,
        orderCount: orders.length,
        customerNames: [...new Set(blocks.map(b => b.consignee).filter(Boolean))],
        totalValue: blocks.reduce((sum, b) => sum + b.totalValue, 0),
        exportedBy: exportedBy || 'unknown',
        exportedAt: new Date(),
        type: 'desarrollo',
      });
    } catch (historyError) {
      console.warn('Failed to save export history:', historyError);
    }

    console.log(`✓ Desarrollo export complete: ${spreadsheetUrl}`);
    return { success: true, sheetUrl: spreadsheetUrl };
  } catch (error) {
    console.error('Export failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    const isAuthError = errorMessage.includes('authentication') ||
                        errorMessage.includes('Unauthorized') ||
                        errorMessage.includes('invalid authentication') ||
                        errorMessage.includes('reconnect your Google account');
    if (isAuthError) {
      return {
        success: false,
        error: 'Google account authentication expired. Please go to Settings → Organization and reconnect your Google account.',
      };
    }
    return { success: false, error: errorMessage };
  }
};
