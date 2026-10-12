import type { Category } from "./categories";

/**
 * Words in a headline that point to a category, for headlines whose URL and feed name no section.
 * Matched as whole words; a word may carry a Bangla case ending (বিএনপির, নির্বাচনে, ভারতের) or an
 * English one (arrested, elections). Words written in capitals (BNP, MP, UN) match only in capitals, as
 * do words marked with "=" ("=Test": the cricket format, not "test").
 * Leave out words that are common in other sections (গোল is also in গোলাগুলি, ভর্তি is also a hospital).
 */
const KEYWORDS: Record<Exclude<Category, "other">, string[]> = {
  national: [
    "সরকার", "প্রধানমন্ত্রী", "মন্ত্রী", "স্বরাষ্ট্রমন্ত্রী", "পরিবেশমন্ত্রী", "পররাষ্ট্রমন্ত্রী", "আইনমন্ত্রী", "কৃষিমন্ত্রী", "খাদ্যমন্ত্রী", "মন্ত্রিসভা", "বাংলাদেশ", "বিমানবন্দর", "শাহজালাল", "আইজিপি", "প্রতিমন্ত্রী", "উপদেষ্টা", "রাষ্ট্রপতি", "সচিব", "সচিবালয়", "জেলা প্রশাসক", "ইউএনও",
    "উপজেলা", "জেলা", "ইউনিয়ন", "পৌরসভা", "সিটি করপোরেশন", "ট্রেন", "রেল", "সড়ক", "মহাসড়ক", "দুর্ঘটনা", "সড়ক দুর্ঘটনা",
    "বন্যা", "ঘূর্ণিঝড়", "আবহাওয়া", "বৃষ্টি", "শীত", "তাপপ্রবাহ", "বজ্রপাত", "ভূমিকম্প", "বিদ্যুৎ", "লোডশেডিং", "সেতু",
    "মেট্রোরেল", "ফেরি", "লঞ্চ", "রোহিঙ্গা", "বিজিবি", "সেনাবাহিনী", "নৌবাহিনী", "বিমানবাহিনী", "ফায়ার সার্ভিস", "অগ্নিকাণ্ড",
    "আগুন", "নদী", "ভাঙন", "যানজট", "জলাবদ্ধতা", "পরিবেশ", "পানি", "ডুবে", "নিখোঁজ",
    "ঢাকা", "চট্টগ্রাম", "রাজশাহী", "খুলনা", "বরিশাল", "সিলেট", "রংপুর", "ময়মনসিংহ", "কুমিল্লা", "গাজীপুর", "নারায়ণগঞ্জ",
    "কক্সবাজার", "নোয়াখালী", "ফেনী", "চাঁদপুর", "ব্রাহ্মণবাড়িয়া", "লক্ষ্মীপুর", "রাঙামাটি", "রাঙ্গামাটি", "বান্দরবান",
    "খাগড়াছড়ি", "টাঙ্গাইল", "কিশোরগঞ্জ", "নরসিংদী", "মানিকগঞ্জ", "মুন্সিগঞ্জ", "ফরিদপুর", "গোপালগঞ্জ", "মাদারীপুর",
    "শরীয়তপুর", "রাজবাড়ী", "জামালপুর", "শেরপুর", "নেত্রকোনা", "বগুড়া", "পাবনা", "সিরাজগঞ্জ", "নাটোর", "নওগাঁ",
    "চাঁপাইনবাবগঞ্জ", "জয়পুরহাট", "যশোর", "সাতক্ষীরা", "বাগেরহাট", "কুষ্টিয়া", "ঝিনাইদহ", "মাগুরা", "নড়াইল", "চুয়াডাঙ্গা",
    "মেহেরপুর", "পটুয়াখালী", "ভোলা", "বরগুনা", "পিরোজপুর", "ঝালকাঠি", "হবিগঞ্জ", "মৌলভীবাজার", "সুনামগঞ্জ", "দিনাজপুর",
    "গাইবান্ধা", "কুড়িগ্রাম", "লালমনিরহাট", "নীলফামারী", "পঞ্চগড়", "ঠাকুরগাঁও", "সেন্টমার্টিন", "সুন্দরবন", "পদ্মা", "যমুনা", "তিস্তা",
    "Bangladesh", "Dhaka", "cabinet", "airport", "IGP", "Chattogram", "Chittagong", "govt", "government", "PM", "prime minister", "minister", "adviser",
    "advisor", "president", "secretariat", "DC", "UNO", "upazila", "district", "train", "railway", "road", "highway",
    "accident", "flood", "cyclone", "weather", "rain", "heatwave", "lightning", "earthquake", "power", "electricity",
    "load-shedding", "bridge", "metro rail", "ferry", "launch capsize", "Rohingya", "BGB", "army", "navy", "fire service",
    "fire", "blaze", "river", "erosion", "traffic", "waterlogging", "environment", "drowned", "missing", "Sylhet", "Rajshahi",
    "Khulna", "Barishal", "Rangpur", "Mymensingh", "Cumilla", "Gazipur", "Narayanganj", "Cox's Bazar", "St Martin's",
    "St. Martin's", "Sundarbans", "Padma", "Teesta",
  ],
  politics: [
    "বিএনপি", "আওয়ামী লীগ", "আওয়ামী", "জামায়াত", "জামায়াতে ইসলামী", "এনসিপি", "জাতীয় পার্টি", "জাপা", "হেফাজতে ইসলাম", "হেফাজতের", "গণঅধিকার", "যুব অধিকার", "বহিষ্কার",
    "ছাত্রদল", "যুবদল", "স্বেচ্ছাসেবক দল", "ছাত্রলীগ", "যুবলীগ", "ছাত্রশিবির", "শিবির", "নির্বাচন", "নির্বাচনী", "ভোট", "ভোটার",
    "ভোটকেন্দ্র", "গণভোট", "নির্বাচন কমিশন", "সংসদ", "সংসদীয়", "এমপি", "সংসদ সদস্য", "মনোনয়ন", "প্রার্থী", "প্রার্থিতা",
    "রাজনীতি", "রাজনৈতিক", "দলীয়", "তারেক রহমান", "খালেদা জিয়া", "মির্জা ফখরুল", "ফখরুল", "রিজভী", "শেখ হাসিনা", "হাসিনা",
    "নাহিদ ইসলাম", "সারজিস", "হাসনাত", "জি এম কাদের", "জিএম কাদের", "সিইসি", "ইশরাক", "সমাবেশ", "বিরোধী দল", "সংস্কার কমিশন", "জুলাই সনদ", "স্পিকার",
    "BNP", "Awami League", "AL", "Jamaat", "NCP", "Jatiya Party", "JP", "Hefazat", "Chhatra Dal", "Jubo Dal", "Chhatra League",
    "Shibir", "election", "electoral", "poll", "polls", "vote", "voter", "voting", "referendum", "EC", "parliament",
    "parliamentary", "MP", "lawmaker", "nomination", "candidate", "candidacy", "political", "politics", "politician",
    "Tarique", "Khaleda", "Fakhrul", "Rizvi", "Hasina", "Nahid Islam", "GM Quader", "CEC", "opposition", "rally", "July Charter", "Speaker",
  ],
  international: [
    "ভারত", "ভারতীয়", "পাকিস্তান", "চীন", "চীনা", "যুক্তরাষ্ট্র", "মার্কিন", "আমেরিকা", "ট্রাম্প", "মোদি", "রাশিয়া",
    "ইউক্রেন", "ইসরায়েল", "ইসরাইল", "ইসরায়েলি", "গাজা", "ফিলিস্তিন", "ফিলিস্তিনি", "ইরান", "সৌদি", "সৌদি আরব", "যুক্তরাজ্য",
    "ব্রিটেন", "ব্রিটিশ", "জাতিসংঘ", "দিল্লি", "কলকাতা", "পশ্চিমবঙ্গ", "মিয়ানমার", "নেপাল", "শ্রীলঙ্কা", "আফগানিস্তান", "জাপান",
    "কোরিয়া", "ফ্রান্স", "জার্মানি", "ইউরোপ", "ইউরোপীয়", "ন্যাটো", "হুতি", "হামাস", "হিজবুল্লাহ", "পুতিন", "ইইউ", "জেলেনস্কি",
    "নেতানিয়াহু", "মধ্যপ্রাচ্য", "কাতার", "দুবাই", "আমিরাত", "মালয়েশিয়া", "তুরস্ক", "লেবানন", "সিরিয়া", "ইয়েমেন", "কানাডা",
    "অস্ট্রেলিয়া", "ওয়াশিংটন", "বেইজিং", "মস্কো", "তেহরান", "কিয়েভ", "হোয়াইট হাউস", "বিজেপি", "কংগ্রেস", "মমতা", "রাহুল গান্ধী", "শাহবাজ", "ইমরান খান", "রাহুল", "মুখ্যমন্ত্রী", "সুদান", "রিয়াদ", "পোল্যান্ড", "থাইল্যান্ড", "ব্যাংকক", "ক্ষেপণাস্ত্র", "বিশ্ববাজার", "নোবেল", "হায়দরাবাদ", "মুম্বাই", "খাইবার পাখতুনখোয়া", "ইসলামাবাদ", "লাহোর", "করাচি", "আফ্রিকা", "মিসর", "মিশর", "ইরাক", "জর্ডান", "আর্জেন্টিনা", "ব্রাজিল", "মেক্সিকো", "ভেনেজুয়েলা", "ইন্দোনেশিয়া", "সিঙ্গাপুর", "ভিয়েতনাম", "ফিলিপাইন", "তালেবান", "হুথি", "কিম জং উন", "শি জিনপিং",
    "India", "Indian", "Pakistan", "Pakistani", "China", "Chinese", "US", "USA", "America", "American", "Trump", "Modi",
    "Russia", "Russian", "Ukraine", "Ukrainian", "Israel", "Israeli", "Gaza", "Palestine", "Palestinian", "Iran", "Iranian",
    "Saudi", "UK", "Britain", "British", "UN", "Delhi", "Kolkata", "West Bengal", "Myanmar", "Nepal", "Sri Lanka", "Afghanistan",
    "Japan", "Korea", "France", "Germany", "Europe", "European", "EU", "NATO", "Houthi", "Hamas", "Hezbollah", "Putin",
    "Zelensky", "Netanyahu", "Middle East", "Qatar", "UAE", "Dubai", "Malaysia", "Turkey", "Lebanon", "Syria", "Yemen",
    "Canada", "Australia", "Washington", "Beijing", "Moscow", "Tehran", "Kyiv", "White House", "BJP", "Mamata", "Rahul Gandhi", "chief minister", "Sudan", "Riyadh", "Poland", "Thailand", "Bangkok", "missile", "Nobel", "Islamabad", "Africa", "Egypt", "Iraq", "Brazil", "Mexico", "Venezuela", "Indonesia", "Singapore", "Vietnam", "Philippines", "Taliban", "Xi Jinping",
  ],
  business: [
    "অর্থনীতি", "অর্থনৈতিক", "ব্যাংক", "বাংলাদেশ ব্যাংক", "শেয়ার", "শেয়ারবাজার", "পুঁজিবাজার", "ডিএসই", "সিএসই", "রপ্তানি",
    "আমদানি", "বাজেট", "রাজস্ব", "এনবিআর", "ভ্যাট", "শুল্ক", "করের", "আয়কর", "ডলার", "মূল্যস্ফীতি", "দাম", "বাজার", "বাজারে", "রেমিট্যান্স",
    "রিজার্ভ", "বিনিয়োগ", "বিনিয়োগকারী", "ঋণ", "আইএমএফ", "অর্থমন্ত্রী", "বাণিজ্যমন্ত্রী", "বিশ্বব্যাংক", "এডিবি", "পোশাক খাত", "পোশাকশিল্প", "তৈরি পোশাক",
    "গার্মেন্টস", "কারখানা", "এলপিজি", "এলপি গ্যাস", "জ্বালানি", "জ্বালানি তেল", "সোনা", "স্বর্ণ", "চাকরি", "নিয়োগ", "নিয়োগ বিজ্ঞপ্তি",
    "প্রবৃদ্ধি", "জিডিপি", "মুনাফা", "লোকসান", "কোম্পানি", "ব্যবসা", "ব্যবসায়ী", "বাণিজ্য", "বাণিজ্যিক", "করপোরেট", "বিমা",
    "সঞ্চয়পত্র", "মোবাইল ব্যাংকিং", "পণ্য", "ভোক্তা", "ধান", "চাল", "পেঁয়াজ", "ডিম", "সবজি", "সয়াবিন", "শিল্পকারখানা", "উদ্যোক্তা",
    "economy", "economic", "bank", "banking", "Bangladesh Bank", "share market", "shares", "stock", "DSE", "CSE", "export", "import",
    "budget", "revenue", "NBR", "VAT", "tariff", "tax", "dollar", "inflation", "price", "remittance", "reserve", "investment",
    "investor", "loan", "IMF", "World Bank", "ADB", "garment", "RMG", "apparel", "factory", "LPG", "fuel", "gold", "job",
    "recruitment", "GDP", "growth", "profit", "company", "business", "trade", "corporate", "insurance", "Tk",
    "taka", "paddy", "rice", "onion", "entrepreneur", "industry", "industrial",
  ],
  sports: [
    "ক্রিকেট", "ক্রিকেটার", "ফুটবল", "ফুটবলার", "ম্যাচ", "ওয়ানডে", "টি-টোয়েন্টি", "টি টোয়েন্টি", "বিশ্বকাপ", "হ্যাটট্রিক",
    "সেঞ্চুরি", "ফিফটি", "উইকেট", "ব্যাটিং", "বোলিং", "ব্যাটার", "বোলার", "ব্যাটসম্যান", "অধিনায়ক", "কোচ", "বিসিবি", "বাফুফে",
    "প্রিমিয়ার লিগ", "চ্যাম্পিয়নস লিগ", "লা লিগা", "বিপিএল", "আইপিএল", "অলিম্পিক", "টাইগার", "টাইগাররা", "সাকিব", "তামিম",
    "মুশফিক", "মিরাজ", "লিটন", "তাসকিন", "মেসি", "রোনালদো", "নেইমার", "এমবাপ্পে", "বার্সেলোনা", "রিয়াল মাদ্রিদ", "হামজা চৌধুরী",
    "হকি", "টেনিস", "দাবা", "অ্যাথলেটিকস", "সাফ চ্যাম্পিয়নশিপ", "শিরোপা", "স্টেডিয়াম", "ইনিংস", "টুর্নামেন্ট", "সিরিজ জয়", "সেমিফাইনাল",
    "কোয়ার্টার ফাইনাল", "ফিফা", "আইসিসি", "খেলোয়াড়", "গোলরক্ষক", "স্ট্রাইকার", "রান", "রান আউট", "ক্রিজ", "ক্যাচ", "টেস্ট", "সিরিজ", "ক্লাব", "বিশ্বরেকর্ড", "সালাহ", "ম্যান সিটি", "ম্যানচেস্টার", "লিভারপুল", "আর্সেনাল", "চেলসি", "বায়ার্ন", "পিএসজি", "ইন্টার মায়ামি", "কোহলি", "বাবর", "রোহিত", "জাতীয় দল", "ফিক্সচার", "স্কোয়াড", "পেনাল্টি", "ড্র",
    "cricket", "cricketer", "football", "footballer", "match", "ODI", "T20", "T20I", "World Cup", "hat-trick", "century",
    "wicket", "batting", "bowling", "batter", "bowler", "captain", "coach", "BCB", "BFF", "Premier League", "Champions League",
    "La Liga", "BPL", "IPL", "Olympic", "Olympics", "Tigers", "Shakib", "Tamim", "Mushfiqur", "Mehidy", "Litton", "Taskin",
    "Messi", "Ronaldo", "Neymar", "Mbappe", "Barcelona", "Real Madrid", "Hamza Choudhury", "hockey", "tennis", "chess",
    "athletics", "SAFF", "stadium", "innings", "squad", "tournament", "semifinal", "semi-final", "quarterfinal", "FIFA",
    "ICC", "striker", "goalkeeper", "midfielder", "=Test", "runs", "run out", "Liverpool", "Arsenal", "Chelsea", "Man City", "Man United", "Manchester", "PSG", "Bayern", "Inter Miami", "Salah", "Kohli", "Babar", "Rohit", "penalty", "fixture", "Test series", "series win",
  ],
  entertainment: [
    "সিনেমা", "চলচ্চিত্র", "নাটক", "অভিনেতা", "অভিনেত্রী", "অভিনয়", "নায়ক", "নায়িকা", "গায়ক", "গায়িকা", "গান", "কনসার্ট",
    "শুটিং", "ওয়েব সিরিজ", "ঢালিউড", "বলিউড", "হলিউড", "টালিউড", "শাকিব খান", "অপু বিশ্বাস", "বুবলী", "পরীমনি", "মেহজাবীন",
    "চঞ্চল চৌধুরী", "জয়া আহসান", "শিল্পী", "সংগীত", "সংগীতশিল্পী", "ওটিটি", "নির্মাতা", "মিউজিক ভিডিও", "শাহরুখ", "সালমান খান",
    "দীপিকা", "প্রিয়াঙ্কা", "অস্কার", "ট্রেইলার", "সেন্সর বোর্ড", "নাট্যকার", "উপস্থাপক", "উপস্থাপিকা", "রিয়েলিটি শো",
    "film", "movie", "cinema", "actor", "actress", "singer", "song", "concert", "drama", "web series", "Dhallywood",
    "Bollywood", "Hollywood", "Tollywood", "Shakib Khan", "OTT", "album", "music", "box office", "Oscar", "Oscars",
    "Netflix", "celebrity", "trailer", "filmmaker", "Shah Rukh", "Salman Khan", "Taylor Swift",
  ],
  tech: [
    "প্রযুক্তি", "বিজ্ঞান", "বিজ্ঞানী", "মোবাইল", "স্মার্টফোন", "ইন্টারনেট", "ফেসবুক", "গুগল", "অ্যাপ", "অ্যাপল", "আইফোন",
    "স্যামসাং", "এআই", "কৃত্রিম বুদ্ধিমত্তা", "চ্যাটজিপিটি", "ওপেনএআই", "সফটওয়্যার", "সাইবার", "হ্যাকার", "হ্যাক", "স্যাটেলাইট",
    "মহাকাশ", "নাসা", "রোবট", "ইলন মাস্ক", "স্টারলিংক", "টেলিকম", "বিটিআরসি", "গ্রামীণফোন", "ইউটিউব", "হোয়াটসঅ্যাপ", "টিকটক",
    "ল্যাপটপ", "কম্পিউটার", "ব্রডব্যান্ড", "ফাইভজি", "গ্যাজেট", "মাইক্রোসফট", "মেটা", "চিপ", "স্টার্টআপ", "ডিজিটাল", "অনলাইন জুয়া",
    "tech", "technology", "science", "scientist", "smartphone", "internet", "Facebook", "Google", "app", "Apple", "iPhone",
    "Samsung", "AI", "artificial intelligence", "ChatGPT", "OpenAI", "software", "cyber", "cyberattack", "hacker", "hack",
    "satellite", "space", "NASA", "robot", "Elon Musk", "Musk", "Starlink", "telecom", "BTRC", "Grameenphone", "YouTube",
    "WhatsApp", "TikTok", "laptop", "computer", "broadband", "5G", "gadget", "Microsoft", "Meta", "chip", "startup", "digital",
  ],
  education: [
    "শিক্ষা", "শিক্ষার্থী", "শিক্ষক", "শিক্ষিকা", "বিশ্ববিদ্যালয়", "ঢাবি", "জাবি", "রাবি", "চবি", "শাবিপ্রবি", "বুয়েট", "চুয়েট",
    "কুয়েট", "রুয়েট", "বাকৃবি", "স্কুল", "কলেজ", "মাদ্রাসা", "পরীক্ষা", "পরীক্ষার্থী", "এসএসসি", "এইচএসসি", "জেএসসি", "ভর্তি পরীক্ষা",
    "জিপিএ", "বৃত্তি", "উপাচার্য", "ক্যাম্পাস", "ইউজিসি", "পাঠ্যবই", "শ্রেণিকক্ষ", "ছাত্র", "ছাত্রী", "শিক্ষাপ্রতিষ্ঠান", "ডাকসু",
    "রাকসু", "চাকসু", "জাকসু", "শিক্ষাবোর্ড", "শিক্ষামন্ত্রী", "শিক্ষা বোর্ড", "এমপিও", "অধ্যক্ষ", "প্রধান শিক্ষক",
    "education", "student", "teacher", "university", "varsity", "DU", "JU", "RU", "CU", "BUET", "CUET", "KUET", "school",
    "college", "madrasa", "madrasah", "exam", "examinee", "SSC", "HSC", "admission test", "GPA", "scholarship",
    "vice-chancellor", "VC", "campus", "UGC", "textbook", "DUCSU", "JUCSU", "RUCSU", "academic", "MPO",
  ],
  health: [
    "স্বাস্থ্য", "হাসপাতাল", "চিকিৎসা", "চিকিৎসক", "ডাক্তার", "রোগী", "ডেঙ্গু", "করোনা", "কোভিড", "টিকা", "ভ্যাকসিন",
    "ক্যানসার", "ক্যান্সার", "ডায়াবেটিস", "হৃদরোগ", "স্ট্রোক", "কিডনি", "ওষুধ", "যক্ষ্মা", "ম্যালেরিয়া", "চিকুনগুনিয়া", "ভাইরাস",
    "সংক্রমণ", "স্বাস্থ্যসেবা", "পুষ্টি", "মানসিক স্বাস্থ্য", "রোগ", "অসুখ", "নিপাহ", "এইডস", "জ্বর", "হার্ট", "রক্তচাপ", "অ্যান্টিবায়োটিক",
    "মেডিকেল", "ক্লিনিক", "নার্স", "ডায়রিয়া", "কলেরা", "জন্ডিস", "হেপাটাইটিস", "ফুসফুস", "লিভার", "অস্ত্রোপচার", "স্বাস্থ্যমন্ত্রী",
    "health", "hospital", "treatment", "doctor", "patient", "dengue", "Covid", "coronavirus", "vaccine", "vaccination",
    "cancer", "diabetes", "heart disease", "stroke", "kidney", "medicine", "TB", "tuberculosis", "malaria", "chikungunya",
    "virus", "infection", "healthcare", "nutrition", "mental health", "disease", "WHO", "Nipah", "AIDS", "HIV", "medical",
    "clinic", "nurse", "diarrhoea", "cholera", "hepatitis", "surgery", "Lancet",
  ],
  lifestyle: [
    "রেসিপি", "রান্না", "খাবার", "ফ্যাশন", "সাজ", "রূপচর্চা", "ত্বক", "ত্বকের", "চুল", "ভ্রমণ", "পর্যটন", "পর্যটক", "সম্পর্ক",
    "দাম্পত্য", "প্যারেন্টিং", "পূজা", "দুর্গাপূজা", "প্রতিমা", "নামাজ", "রোজা", "ঈদ", "হজ", "ওমরাহ", "ইসলাম", "ইসলামি",
    "মসজিদ", "মন্দির", "ধর্ম", "ধর্মীয়", "আল্লাহ", "কোরআন", "হাদিস", "রাসুল", "দোয়া", "আমল", "ব্যায়াম", "ওজন", "ঘুম",
    "উৎসব", "লাইফস্টাইল", "জীবনযাপন", "শারদীয়", "বিজয়া দশমী", "মহালয়া", "ক্রিসমাস", "বড়দিন", "প্রবারণা",
    "recipe", "cooking", "food", "fashion", "beauty", "skincare", "skin", "hair", "travel", "tourism", "tourist",
    "relationship", "parenting", "puja", "Durga Puja", "prayer", "Ramadan", "Eid", "Hajj", "Umrah", "Islam", "Islamic",
    "mosque", "temple", "religion", "religious", "exercise", "weight loss", "sleep", "festival", "lifestyle", "wellness",
    "diet", "Christmas",
  ],
  crime: [
    "হত্যা", "হত্যাকাণ্ড", "খুন", "গ্রেপ্তার", "গ্রেফতার", "আটক", "মামলা", "ধর্ষণ", "ধর্ষক", "লাশ", "মরদেহ", "ছিনতাই",
    "ডাকাতি", "ডাকাত", "চুরি", "চোর", "অপহরণ", "মাদক", "ইয়াবা", "পুলিশ", "র‍্যাব", "রিমান্ড", "কারাগার", "জামিন", "আদালত",
    "হাইকোর্ট", "সুপ্রিম কোর্ট", "অ্যাটর্নি জেনারেল", "মারধর", "নিপীড়ন", "আপিল বিভাগ", "রায়", "সাজা", "কারাদণ্ড", "মৃত্যুদণ্ড", "যাবজ্জীবন", "অভিযান", "জব্দ", "প্রতারণা", "প্রতারক",
    "চাঁদাবাজি", "চাঁদা", "সন্ত্রাসী", "কুপিয়ে", "গুলি", "গুলিতে", "গোলাগুলি", "ছুরিকাঘাত", "দুদক", "দুর্নীতি", "ট্রাইব্যুনাল",
    "অস্ত্র", "পাচার", "চোরাচালান", "চোরাচালানকারী", "নির্যাতন", "হামলা", "ভাঙচুর", "সংঘর্ষ", "ডিএমপি", "সিআইডি", "পিবিআই",
    "ডিবি", "থানা", "ওসি", "অভিযোগপত্র", "জবানবন্দি", "আসামি", "পলাতক", "গণপিটুনি", "সন্ত্রাসবিরোধী আইন", "বরখাস্ত",
    "murder", "murdered", "killing", "arrest", "arrested", "rape", "raped", "body", "robbery", "mugging", "theft", "abduct",
    "abducted", "kidnap", "kidnapped", "drug", "yaba", "police", "RAB", "remand", "jail", "jailed", "prison", "bail",
    "court", "High Court", "Supreme Court", "attorney general", "assault", "assaulted", "verdict", "sentence", "sentenced", "death penalty", "life imprisonment", "seize", "seized",
    "fraud", "extortion", "terrorist", "stabbed", "shot", "ACC", "corruption", "tribunal", "arms", "smuggling",
    "trafficking", "crime", "criminal", "lawsuit", "charge sheet", "chargesheet", "DMP", "CID", "PBI", "DB", "detective",
    "accused", "convicted", "found dead", "detained", "detain", "mob", "lynching", "attack", "clash", "vandalism",
  ],
  opinion: [
    "সম্পাদকীয়", "উপসম্পাদকীয়", "মতামত", "অভিমত", "কলাম", "চিঠিপত্র", "editorial", "opinion", "op-ed", "column", "commentary",
  ],
};

// Case endings a word may carry: Bangla (বিএনপির, ভারতের, নির্বাচনে, শিক্ষার্থীদের) and English (elections, arrested).
const ENDING =
  "(?:র|এর|ের|য়ের|য়|য়ে|এ|ে|তে|কে|কেও|দের|দেরকে|রা|েরা|টি|টির|টা|টাকে|ও|ই|েই|রই|েরও|গুলো|গুলোর|সহ|s|es|'s|’s|d|ed|ing)?";
// Not inside a longer word: no letter, vowel sign or digit (Bangla or Latin) on either side.
const BEFORE = "(?<![\\p{L}\\p{M}\\p{N}])";
const AFTER = "(?![\\p{L}\\p{M}\\p{N}])";

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** One pattern per category; longer words first, so "প্রিমিয়ার লিগ" is matched before a shorter word inside it. */
function pattern(words: string[], flags: string): RegExp | undefined {
  if (!words.length) return undefined;
  const alts = [...words].sort((a, b) => b.length - a.length).map((w) => escape(w.normalize("NFC")));
  return new RegExp(`${BEFORE}(?:${alts.join("|")})${ENDING}${AFTER}`, flags);
}

/** Acronyms in capitals (BNP, UN, US) are words only when written in capitals; "us" and "un-" are not. */
const exactCase = (w: string) => w.startsWith("=") || /^[A-Z0-9]{2,6}$/.test(w);

const PATTERNS = (Object.entries(KEYWORDS) as [Exclude<Category, "other">, string[]][]).map(([category, words]) => ({
  category,
  anyCase: pattern(words.filter((w) => !exactCase(w)), "giu"),
  capitals: pattern(words.filter(exactCase).map((w) => w.replace(/^=/, "")), "gu"),
}));

/**
 * How many distinct keywords of each category a headline has. Normalized like categories.ts, so
 * a precomposed "য়" matches "য" + nukta.
 */
export function headlineScores(title: string): Map<Category, number> {
  const text = title.normalize("NFC");
  const scores = new Map<Category, number>();
  for (const { category, anyCase, capitals } of PATTERNS) {
    const found = new Set<string>();
    for (const re of [anyCase, capitals]) {
      for (const m of re ? text.matchAll(re) : []) found.add(m[0].toLowerCase());
    }
    if (found.size) scores.set(category, found.size);
  }
  return scores;
}
