import type { Sku } from "@/lib/types";

// Master catalog of common kirana SKUs. Prices are indicative (₹) and are
// overridden by whatever the distributor bill says. `aliases` are the names
// owners and customers actually use; shops add more as they confirm matches.
type Row = Omit<Sku, "shop_id">;

const s = (
  id: string,
  name: string,
  brand: string,
  category: Sku["category"],
  pack: string,
  mrp: number,
  cost: number,
  case_qty: number,
  shelf_life_days: number,
  base_velocity: number,
  aliases: string[],
): Row => ({ id, name, brand, category, pack, mrp, cost, case_qty, shelf_life_days, base_velocity, aliases });

export const CATALOG: Row[] = [
  // Staples
  s("aashirvaad-atta-5kg", "Aashirvaad Atta 5kg", "ITC", "staples", "5kg", 295, 268, 4, 90, 1.2, ["atta", "aata", "gehu ka atta", "आटा", "aashirwad atta", "godhi hittu"]),
  s("loose-rice-sona-1kg", "Sona Masoori Rice 1kg", "Loose", "staples", "1kg", 68, 58, 25, 365, 4, ["chawal", "rice", "sona masoori", "चावल", "akki", "arisi"]),
  s("toor-dal-1kg", "Toor Dal 1kg", "Loose", "staples", "1kg", 165, 148, 10, 270, 1.5, ["arhar dal", "tuvar dal", "toor", "दाल", "togari bele", "thuvaram paruppu"]),
  s("moong-dal-500g", "Moong Dal 500g", "Loose", "staples", "500g", 70, 61, 20, 270, 0.8, ["moong", "mung dal", "hesaru bele", "pasi paruppu"]),
  s("tata-salt-1kg", "Tata Salt 1kg", "Tata", "staples", "1kg", 28, 24, 25, 720, 2.5, ["namak", "salt", "नमक", "uppu"]),
  s("sugar-1kg", "Sugar 1kg", "Loose", "staples", "1kg", 48, 43, 30, 365, 3, ["cheeni", "shakkar", "chini", "चीनी", "sakkare"]),
  s("rava-500g", "Bombay Rava 500g", "Loose", "staples", "500g", 38, 32, 20, 180, 0.9, ["sooji", "suji", "rava", "semolina", "ravai"]),
  s("besan-500g", "Besan 500g", "Loose", "staples", "500g", 62, 54, 20, 180, 0.6, ["besan", "gram flour", "kadle hittu", "kadalai maavu"]),
  s("poha-500g", "Poha 500g", "Loose", "staples", "500g", 40, 34, 20, 180, 0.7, ["poha", "avalakki", "aval", "chivda"]),

  // Oil & ghee
  s("fortune-sunflower-1l", "Fortune Sunflower Oil 1L", "Adani Wilmar", "oil_ghee", "1L pouch", 155, 140, 12, 270, 2, ["sunflower oil", "tel", "refined", "fortune oil", "तेल", "enne"]),
  s("gold-winner-1l", "Gold Winner Sunflower Oil 1L", "Kaleesuwari", "oil_ghee", "1L pouch", 150, 136, 12, 270, 1.2, ["gold winner", "goldwinner oil"]),
  s("amul-ghee-500ml", "Amul Ghee 500ml", "Amul", "oil_ghee", "500ml", 330, 300, 12, 270, 0.3, ["ghee", "ghee amul", "घी", "tuppa", "nei"]),
  s("groundnut-oil-1l", "Groundnut Oil 1L", "Loose", "oil_ghee", "1L", 190, 172, 12, 180, 0.5, ["mungfali tel", "kadale enne", "kadalai ennai", "peanut oil"]),

  // Dairy & bakery (short shelf life)
  s("nandini-milk-500ml", "Nandini Toned Milk 500ml", "Nandini", "dairy", "500ml", 24, 22, 20, 2, 18, ["milk", "doodh", "हालु", "haalu", "paal", "nandini"]),
  s("amul-butter-100g", "Amul Butter 100g", "Amul", "dairy", "100g", 62, 56, 20, 180, 0.6, ["butter", "makhan", "amul butter"]),
  s("curd-400g", "Nandini Curd 400g", "Nandini", "dairy", "400g", 30, 27, 12, 4, 4, ["dahi", "curd", "mosaru", "thayir"]),
  s("paneer-200g", "Paneer 200g", "Milky Mist", "dairy", "200g", 95, 84, 10, 10, 0.8, ["paneer", "cottage cheese"]),
  s("bread-modern-400g", "Modern Bread 400g", "Modern", "bakery", "400g", 45, 40, 10, 4, 3, ["bread", "double roti", "pav", "breed"]),
  s("rusk-200g", "Britannia Toast Rusk 200g", "Britannia", "bakery", "200g", 40, 35, 24, 120, 0.7, ["rusk", "toast", "papay"]),

  // Snacks & biscuits
  s("parle-g-80g", "Parle-G 80g", "Parle", "snacks", "80g", 10, 8.6, 96, 180, 12, ["parle g", "parleg", "biscuit", "glucose biscuit", "बिस्किट"]),
  s("good-day-100g", "Britannia Good Day 100g", "Britannia", "snacks", "100g", 30, 26, 48, 180, 2, ["good day", "goodday", "cashew biscuit"]),
  s("marie-gold-250g", "Britannia Marie Gold 250g", "Britannia", "snacks", "250g", 40, 35, 36, 180, 1, ["marie", "marie gold", "mary biscuit"]),
  s("bourbon-150g", "Britannia Bourbon 150g", "Britannia", "snacks", "150g", 35, 30, 36, 180, 0.8, ["bourbon", "chocolate biscuit"]),
  s("lays-classic-52g", "Lay's Classic Salted 52g", "PepsiCo", "snacks", "52g", 20, 17, 60, 120, 4, ["lays", "chips", "lays chips", "wafers", "lays salted"]),
  s("kurkure-masala-90g", "Kurkure Masala Munch 90g", "PepsiCo", "snacks", "90g", 20, 17, 60, 120, 3.5, ["kurkure", "kurkure masala"]),
  s("haldiram-bhujia-200g", "Haldiram's Aloo Bhujia 200g", "Haldiram's", "snacks", "200g", 55, 47, 30, 180, 1.2, ["bhujia", "aloo bhujia", "namkeen", "mixture", "haldiram"]),
  s("dairy-milk-50g", "Cadbury Dairy Milk 50g", "Mondelez", "snacks", "50g", 50, 43, 48, 270, 1.5, ["dairy milk", "chocolate", "cadbury", "dairymilk"]),

  // Beverages
  s("red-label-250g", "Brooke Bond Red Label Tea 250g", "HUL", "beverages", "250g", 145, 130, 24, 365, 1, ["chai patti", "tea", "red label", "चाय", "tea powder", "chaha"]),
  s("tata-tea-gold-250g", "Tata Tea Gold 250g", "Tata", "beverages", "250g", 165, 148, 24, 365, 0.6, ["tata tea", "tata gold"]),
  s("bru-instant-50g", "Bru Instant Coffee 50g", "HUL", "beverages", "50g", 115, 102, 24, 540, 0.6, ["bru", "coffee", "kaapi", "coffee powder"]),
  s("horlicks-500g", "Horlicks 500g", "HUL", "beverages", "500g", 290, 262, 12, 365, 0.15, ["horlicks", "health drink"]),
  s("boost-500g", "Boost 500g", "HUL", "beverages", "500g", 285, 258, 12, 365, 0.1, ["boost"]),
  s("thums-up-750ml", "Thums Up 750ml", "Coca-Cola", "beverages", "750ml", 40, 34, 24, 180, 2, ["thums up", "thumsup", "cold drink", "coke"]),
  s("frooti-160ml", "Frooti 160ml", "Parle Agro", "beverages", "160ml", 12, 10, 48, 180, 2.5, ["frooti", "mango drink", "juice"]),

  // Instant food
  s("maggi-70g", "Maggi Masala Noodles 70g", "Nestlé", "instant_food", "70g", 15, 13, 96, 270, 8, ["maggi", "noodles", "maggie", "मैगी", "maggi packet"]),
  s("maggi-280g", "Maggi Masala Noodles 4-pack 280g", "Nestlé", "instant_food", "280g", 60, 53, 24, 270, 0.8, ["maggi 4 pack", "maggi family pack", "maggi bada"]),
  s("yippee-60g", "Sunfeast Yippee 60g", "ITC", "instant_food", "60g", 15, 13, 96, 270, 2, ["yippee", "yipee noodles"]),
  s("mtr-rava-idli-500g", "MTR Rava Idli Mix 500g", "MTR", "instant_food", "500g", 130, 115, 24, 180, 0.2, ["mtr idli", "idli mix", "rava idli"]),
  s("kissan-jam-200g", "Kissan Mixed Fruit Jam 200g", "HUL", "instant_food", "200g", 85, 76, 24, 365, 0.15, ["jam", "kissan jam"]),

  // Spices
  s("mdh-garam-masala-100g", "MDH Garam Masala 100g", "MDH", "spices", "100g", 98, 86, 20, 365, 0.4, ["garam masala", "masala", "mdh"]),
  s("everest-chilli-100g", "Everest Chilli Powder 100g", "Everest", "spices", "100g", 52, 45, 20, 365, 0.6, ["mirchi powder", "lal mirch", "chilli powder", "menasina pudi", "milagai thool"]),
  s("haldi-100g", "Turmeric Powder 100g", "Everest", "spices", "100g", 38, 33, 20, 540, 0.6, ["haldi", "turmeric", "arishina", "manjal"]),
  s("jeera-100g", "Jeera 100g", "Loose", "spices", "100g", 65, 56, 20, 365, 0.4, ["jeera", "cumin", "jeerige", "seeragam"]),

  // Sweets, dry fruits (festival-sensitive)
  s("cashew-250g", "Cashew 250g", "Loose", "sweets_dryfruits", "250g", 260, 228, 10, 180, 0.15, ["kaju", "cashew", "godambi", "mundhiri"]),
  s("almond-250g", "Almonds 250g", "Loose", "sweets_dryfruits", "250g", 280, 245, 10, 270, 0.12, ["badam", "almond"]),
  s("raisins-100g", "Raisins 100g", "Loose", "sweets_dryfruits", "100g", 60, 51, 20, 180, 0.2, ["kishmish", "raisins", "ona drakshi", "dry grapes"]),
  s("jaggery-1kg", "Jaggery 1kg", "Loose", "sweets_dryfruits", "1kg", 75, 64, 10, 180, 0.5, ["gud", "jaggery", "bella", "vellam"]),
  s("gulab-jamun-mix-200g", "MTR Gulab Jamun Mix 200g", "MTR", "sweets_dryfruits", "200g", 120, 104, 24, 270, 0.1, ["gulab jamun mix", "jamun mix"]),

  // Pooja
  s("agarbatti-cycle", "Cycle Agarbatti 3-in-1", "Cycle", "pooja", "pack", 50, 42, 24, 720, 0.8, ["agarbatti", "incense", "oodhubatti", "cycle agarbatti"]),
  s("camphor-50g", "Camphor 50g", "Loose", "pooja", "50g", 60, 50, 24, 720, 0.3, ["kapoor", "camphor", "karpoora", "karpooram"]),
  s("diya-pack", "Clay Diya (12 pcs)", "Loose", "pooja", "12 pcs", 60, 42, 10, 720, 0.05, ["diya", "deepam", "hanate", "agal vilakku"]),
  s("matchbox-10", "Ship Matchbox (10 pack)", "Ship", "pooja", "10 boxes", 20, 16, 50, 720, 1, ["matchbox", "machis", "beedi kaddi", "theepetti"]),

  // Personal care
  s("lifebuoy-125g", "Lifebuoy Soap 125g", "HUL", "personal_care", "125g", 42, 36, 72, 720, 1.5, ["lifebuoy", "sabun", "soap", "साबुन"]),
  s("dettol-soap-75g", "Dettol Soap 75g", "Reckitt", "personal_care", "75g", 40, 34, 72, 720, 0.8, ["dettol soap", "dettol"]),
  s("colgate-100g", "Colgate Strong Teeth 100g", "Colgate", "personal_care", "100g", 58, 50, 48, 720, 0.8, ["colgate", "toothpaste", "paste", "manjan"]),
  s("clinic-plus-sachet", "Clinic Plus Shampoo Sachet (16 pcs)", "HUL", "personal_care", "16 sachets", 32, 27, 24, 720, 0.6, ["shampoo", "clinic plus", "sachet"]),
  s("parachute-100ml", "Parachute Coconut Oil 100ml", "Marico", "personal_care", "100ml", 52, 45, 48, 540, 0.7, ["coconut oil", "nariyal tel", "parachute", "kobbari enne", "thengai ennai"]),
  s("dettol-handwash-200ml", "Dettol Handwash 200ml", "Reckitt", "personal_care", "200ml", 99, 86, 24, 540, 0.1, ["handwash", "dettol handwash"]),

  // Home care
  s("surf-excel-500g", "Surf Excel Easy Wash 500g", "HUL", "home_care", "500g", 75, 66, 30, 720, 0.9, ["surf", "surf excel", "washing powder", "detergent", "surf ka packet"]),
  s("rin-bar-250g", "Rin Detergent Bar 250g", "HUL", "home_care", "250g", 30, 26, 40, 720, 0.8, ["rin", "rin bar", "kapde ka sabun", "bar soap"]),
  s("vim-bar-200g", "Vim Bar 200g", "HUL", "home_care", "200g", 25, 21, 48, 720, 1, ["vim", "bartan sabun", "vim bar", "dishwash"]),
  s("harpic-500ml", "Harpic Toilet Cleaner 500ml", "Reckitt", "home_care", "500ml", 105, 92, 24, 720, 0.3, ["harpic", "toilet cleaner"]),
  s("good-knight-refill", "Good Knight Liquid Refill", "Godrej", "home_care", "45ml", 85, 74, 24, 720, 0.3, ["good knight", "mosquito", "machhar", "all out"]),
];
