"""
Keyword lists for NZ and common merchants — lists kept alphabetically sorted for determinism.
"""

from __future__ import annotations

# Groceries — NZ chains + common
GROCERIES: list[str] = sorted(
    [
        "butcher",
        "countdown",
        "new world",
        "paknsave",
        "pak n save",
        "four square",
        "woolworths",
        "freshchoice",
        "supervalue",
        "night n day",
        "raeward fresh",
        "moore wilsons",
    ]
)

DINING: list[str] = sorted(
    [
        "bakery",
        "burgerfuel",
        "domino",
        "hell pizza",
        "kfc",
        "mcdonald",
        "subway",
        "tuck shop",
        "wendy",
        "zambrero",
        "restaurant",
        "cafe",
        "coffee",
        "uber eats",
        "menulog",
        "delivereasy",
    ]
)

# App-based rides — evaluated after dining so "Uber Eats" stays dining.
RIDESHARE: list[str] = sorted(
    [
        "lyft",
        "uber",
        "zoomy",
    ]
)

# WOF, VTNZ, mechanics, and tyre merchants — before Transport so vehicle-testing strings do not hit PT/toll rules.
VEHICLE_MAINTENANCE: list[str] = sorted(
    [
        "autobahn",
        "automotive",
        "beaurepaires",
        "bob jane",
        "bridgestone",
        "car service",
        "firestone",
        "goodyear",
        "mag & turbo",
        "mag and turbo",
        "mechanic",
        "midas",
        "oil change",
        "panel beater",
        "pit stop",
        "tireland",
        "tyre",
        "tyre centre",
        "tyre city",
        "ultra tune",
        "ultratune",
        "vehicle test",
        "vtnz",
        "warrant of fitness",
        "wheel alignment",
        "wof",
    ]
)

# Personal transport: PT, taxi, parking-style merchants, and all NZ fuel brands (merged with former FUEL category).
TRANSPORT: list[str] = sorted(
    [
        " bp",
        " z ",
        "allied petroleum",
        "at hop",
        "at public transport",
        "at public transpo",
        "auckland transport",
        "bluebridge",
        "bp ",
        "caltex",
        "challenge",
        "fuel",
        "fullers",
        "gas station",
        "gull",
        "intercity",
        "kiwirail",
        "metlink",
        "mobil",
        "npd",
        "nz transport agency",
        "nz transportagency",
        "parkable",
        "petrol",
        "servo",
        "shell",
        "snapper",
        "taxi",
        "-toll",
        "transportagency",
        "waitomo",
        "z energy",
        "z petroleum",
        "z retail",
        "zenergy",
    ]
)

UTILITIES_NET: list[str] = sorted(
    [
        "spark",
        "vodafone",
        "2degrees",
        "one new zealand",
        "one nz",
        "slingshot",
        "orcon",
        "bigpipe",
        "skinny",
        "2talk",
    ]
)

UTILITIES_POWER: list[str] = sorted(
    [
        "contact energy",
        "genesis",
        "meridian",
        "mercury nz",
        "trustpower",
        "nova energy",
        "electric kiwi",
        "powershop",
        "vector",
    ]
)

# Private health insurers — before generic INSURANCE in builtins order.
HEALTH_INSURANCE: list[str] = sorted(
    [
        "nib health",
        "nib nz",
        "partners life",
        "southern cross",
        "southern cross health",
        "unimed",
    ]
)

INSURANCE: list[str] = sorted(
    [
        "aa insurance",
        "aia",
        "ami",
        "state insurance",
        "tower insurance",
        "vero",
        "iag",
        "crombie lockwood",
    ]
)

ENTERTAINMENT: list[str] = sorted(
    [
        "netflix",
        "spotify",
        "neon",
        "sky sport",
        "sky tv",
        "cinema",
        "ticketek",
        "eventfinda",
        "steam",
        "playstation",
        "xbox",
    ]
)

SUBSCRIPTIONS: list[str] = sorted(
    [
        "microsoft 365",
        "adobe",
        "dropbox",
        "github",
        "openai",
        "cursor",
        "jetbrains",
        "notion",
        "slack",
        "zoom",
    ]
)

HEALTHCARE: list[str] = sorted(
    [
        "chemist",
        "pharmacy",
        "life pharmacy",
        "unichem",
        "medical centre",
        "dental",
        "physio",
        "specialist",
    ]
)

FEES_BANK: list[str] = sorted(
    [
        "foreign currency",
        "intl service fee",
        "overdraft fee",
        "account fee",
        "service fee",
        "dishonour",
    ]
)

# Investments — platforms and brokers (NZ-focused)
INVESTMENTS: list[str] = sorted(
    [
        "sharesies",
        "hatch invest",
        "kernel wealth",
        "stake ",
        " investnow",
        "tiger brokers",
        "asb securities",
        "jarden",
        "forsyth barr",
        "craigs",
        "anz investments",
        "smartshares",
        "nzdx",
        "nzx",
        "broker",
        "securities ltd",
        "dividend reinvest",
    ]
)

# KiwiSaver, superannuation, IRD-related retirement
RETIREMENT_KIWISAVER: list[str] = sorted(
    [
        "kiwisaver",
        "kiwi saver",
        "ird ks",
        "inland revenue ks",
        "employer contribution ks",
        "milford kiwisaver",
        "fisher funds kiwi",
        "generate kiwisaver",
        "booster kiwisaver",
        "superlife kiwi",
        "simplicity kiwisaver",
        "anz kiwisaver",
        "asb kiwisaver",
        "westpac kiwisaver",
        "bnz kiwisaver",
        "kiwi wealth ks",
        "superannuation",
        "salary sacrifice",
        "voluntary kiwi",
    ]
)

# Bank savings interest — positive amounts only (see builtins); evaluated before generic income.
INTEREST_EARNED: list[str] = sorted(
    [
        "bonus interest",
        "credit interest",
        "deposit interest",
        "interest paid",
        "savings interest",
    ]
)

INCOME: list[str] = sorted(
    [
        "salary",
        "wages",
        "payroll",
        "dividend",
        "refund",
    ]
)

TRANSFERS: list[str] = sorted(
    [
        "between accounts",
        "internal transfer",
        "internet banking transfer",
        "transfer from",
        "transfer to",
    ]
)

RENT: list[str] = sorted(
    [
        "rent payment",
        "board payment",
        "mortgage",
        "home loan",
        "property management",
    ]
)

EDUCATION: list[str] = sorted(
    [
        "university",
        "school fees",
        "studylink",
        "course fee",
        "kindergarten",
        "daycare",
    ]
)

PETS: list[str] = sorted(
    [
        "vet",
        "petstock",
        "animates",
        "petbarn",
    ]
)

TRAVEL: list[str] = sorted(
    [
        "booking.com",
        "airbnb",
        "air new zealand",
        "jetstar",
        "qantas",
        "hotel",
        "motel",
    ]
)

SHOPPING: list[str] = sorted(
    [
        "kmart",
        "the warehouse",
        "target",
        "bunnings",
        "mitre 10",
        "jaycar",
        "jb hi-fi",
        "noel leeming",
    ]
)

PERSONAL_CARE: list[str] = sorted(
    [
        "hairdress",
        "barber",
        "beauty",
        "massage",
        "gym",
        "les mills",
    ]
)

GIFTS: list[str] = sorted(
    [
        "red cross",
        "salvation army",
        "givealittle",
        "donation",
    ]
)

CHILDREN: list[str] = sorted(
    [
        "kindergarten",
        "childcare",
        "after school",
        "kids ",
    ]
)

CASH: list[str] = sorted(
    [
        "atm withdrawal",
        "cash out",
        "cash advance",
    ]
)
