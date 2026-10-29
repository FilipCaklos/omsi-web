import type { AppLocale } from "./config";

/**
 * Texty právnych stránok. Zástupné symboly {email}, {operator} a {site} dopĺňa LegalPage.
 * Lehoty uchovávania musia sedieť so src/server/jobs/retention.ts – pri zmene uprav oboje.
 */
export type LegalSection = { heading: string; paragraphs?: string[]; items?: string[] };
export type LegalDocument = { title: string; description: string; updated: string; intro: string; sections: LegalSection[] };
export type LegalDocumentName = "privacy" | "terms" | "contact";

const UPDATED = "2026-10-29";

const sk: Record<LegalDocumentName, LegalDocument> = {
  privacy: {
    title: "Ochrana osobných údajov",
    description: "Aké osobné údaje {site} spracúva, prečo, ako dlho ich uchováva a aké máš práva.",
    updated: UPDATED,
    intro:
      "Na sťahovanie modifikácií nepotrebuješ účet a nezbierame o tebe nič, čo by ťa priamo identifikovalo. Táto stránka vysvetľuje, aké údaje spracúvame pri sťahovaní a pri používaní účtu.",
    sections: [
      {
        heading: "Prevádzkovateľ",
        paragraphs: [
          "Prevádzkovateľ portálu {site} a správca osobných údajov: {operator}. Vo veciach ochrany osobných údajov nás kontaktuj na {email}.",
        ],
      },
      {
        heading: "Aké údaje spracúvame",
        items: [
          "Účet: používateľské meno, zobrazované meno, email, heslo (uložené iba ako Argon2id hash, nikdy v čitateľnej podobe), jazyk a rola.",
          "Prihlásenie cez Discord (ak ho použiješ): identifikátor účtu Discord, meno a email, ktoré nám Discord odovzdá.",
          "Prihlásenia: pri každom prihlásení uložíme IP adresu a identifikáciu prehliadača (user agent) k danej relácii.",
          "Obsah, ktorý pridáš: modifikácie, súbory, obrázky, popisy, recenzie, komentáre, hlásenia chýb a nahlásenia.",
          "IP adresa návštevníka: neukladáme ju v čitateľnej podobe, iba ako jednosmerný kryptografický odtlačok (HMAC-SHA256). Používa sa na ochranu pred zneužitím (limity pokusov), na započítanie stiahnutia raz za 24 hodín a v bezpečnostnom zázname.",
          "Technické cookies (pozri nižšie).",
        ],
      },
      {
        heading: "Prečo a na akom právnom základe",
        items: [
          "Vytvorenie a vedenie účtu, nahrávanie a zverejňovanie obsahu – plnenie zmluvy, teda týchto podmienok používania (čl. 6 ods. 1 písm. b GDPR).",
          "Bezpečnosť portálu, ochrana pred spamom, botmi a útokmi na účty, bezpečnostný záznam a štatistiky sťahovaní – oprávnený záujem prevádzkovateľa (čl. 6 ods. 1 písm. f GDPR).",
          "Emaily: overenie adresy, obnova hesla a upozornenia, ktoré si zapneš v nastaveniach účtu. Upozornenia môžeš kedykoľvek vypnúť.",
        ],
        paragraphs: ["Údaje nepredávame, nepoužívame na reklamu ani na profilovanie a nerobíme na ich základe automatizované rozhodnutia."],
      },
      {
        heading: "Ako dlho údaje uchovávame",
        items: [
          "Účet a obsah: kým účet existuje. Po zmazaní účtu odstránime aj tvoje recenzie, komentáre, hlásenia a modifikácie.",
          "Relácie prihlásenia (vrátane IP adresy a identifikácie prehliadača): najviac 30 dní, potom sa automaticky mažú.",
          "Počítadlá limitov pokusov: najviac 1 hodinu. Záznam o stiahnutí na započítanie: 24 hodín.",
          "Záznamy o stiahnutiach pre štatistiky (odtlačok IP, súbor, čas): 90 dní.",
          "Bezpečnostný záznam (napr. prihlásenia, zmeny rolí, rozhodnutia moderátorov): 1 rok.",
          "Nedokončené a nepripojené uploady: 24 hodín, hotový nepripojený upload 7 dní.",
        ],
      },
      {
        heading: "Komu údaje odovzdávame",
        paragraphs: ["Údaje spracúvame na vlastnom serveri. Pri prevádzke využívame týchto sprostredkovateľov:"],
        items: [
          "Cloudflare, Inc. – doručovanie stránky, ochrana pred útokmi a overenie Turnstile proti botom. Prenos do USA je krytý rámcom EU–US Data Privacy Framework a štandardnými zmluvnými doložkami.",
          "Poskytovateľ odosielania emailov – doručuje overovacie a upozorňovacie emaily (spracúva tvoju emailovú adresu a obsah správy).",
          "Discord Inc. – iba ak sa rozhodneš prihlásiť cez Discord.",
          "VirusTotal (Google) – antivírusová kontrola súborov modov. Súbor kontrolujeme najprv podľa odtlačku SHA-256; ak ho VirusTotal nepozná, nahráme ho tam až po verejnom zverejnení modu. Nahraté súbory sú dostupné bezpečnostnej komunite VirusTotalu. Osobné údaje do VirusTotalu neposielame.",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "Používame iba cookies nevyhnutné na fungovanie portálu, preto nepotrebujeme tvoj súhlas a nezobrazujeme cookie lištu. Nepoužívame analytiku ani reklamné cookies.",
        ],
        items: [
          "omsi.* – prihlásenie a bezpečnosť relácie (platnosť do odhlásenia, najviac 30 dní).",
          "locale a theme – zapamätaný jazyk a farebný režim.",
          "Technické cookies Cloudflare (napr. __cf_bm) – ochrana pred automatizovanými útokmi.",
        ],
      },
      {
        heading: "Tvoje práva",
        items: [
          "prístup k údajom a ich kópia (aj v prenosnom formáte),",
          "oprava nesprávnych údajov – meno a profil upravíš aj sám v nastaveniach účtu,",
          "vymazanie údajov a účtu,",
          "obmedzenie spracúvania a námietka proti spracúvaniu na základe oprávneného záujmu,",
          "podanie sťažnosti na Úrad na ochranu osobných údajov SR (dataprotection.gov.sk), v Česku na Úřad pro ochranu osobních údajů (uoou.gov.cz).",
        ],
        paragraphs: [
          "Žiadosť pošli na {email} z adresy, ktorú máš pri účte. Vybavíme ju bez zbytočného odkladu, najneskôr do 30 dní.",
        ],
      },
      {
        heading: "Vek",
        paragraphs: ["Účet si môžeš založiť od 16 rokov. Ak máš menej, potrebuješ súhlas rodiča alebo zákonného zástupcu. Sťahovať môže ktokoľvek bez účtu."],
      },
      {
        heading: "Zmeny",
        paragraphs: ["Pri podstatnej zmene týchto zásad ťa upozorníme na portáli alebo emailom. Dátum poslednej zmeny je uvedený hore."],
      },
    ],
  },

  terms: {
    title: "Podmienky používania",
    description: "Pravidlá portálu {site} pre sťahovanie, nahrávanie a správanie v komunite.",
    updated: UPDATED,
    intro:
      "{site} je komunitný portál na zdieľanie modifikácií pre OMSI 2. Používaním portálu súhlasíš s týmito pravidlami. Píšeme ich zrozumiteľne – ak ti niečo nie je jasné, napíš nám na {email}.",
    sections: [
      {
        heading: "Sťahovanie",
        items: [
          "Sťahovanie je bezplatné a bez registrácie.",
          "Modifikácie sú dielom ich autorov, nie prevádzkovateľa. Pri každej sú uvedené licenčné podmienky autora (napr. zákaz ďalšieho zverejnenia, povolené repainty) – dodržuj ich.",
          "Súbory automaticky kontrolujeme (typ súboru, obsah archívu, nebezpečné súbory, antivírusy cez VirusTotal) a pluginy .dll schvaľuje moderátor. Zverejnením modu súhlasíš, že jeho súbory môžeme poslať na kontrolu do VirusTotalu. Napriek tomu nevieme zaručiť, že je každý súbor bezchybný – sťahuješ a inštaluješ na vlastnú zodpovednosť a odporúčame zálohovať priečinok OMSI.",
          "Odkaz na stiahnutie je určený pre teba a platí obmedzený čas. Hromadné sťahovanie robotmi a zdieľanie priamych odkazov na súbory nie je dovolené.",
        ],
      },
      {
        heading: "Účet",
        items: [
          "Uvádzaj pravdivý email a chráň svoje heslo. Za činnosť zo svojho účtu zodpovedáš ty.",
          "Jeden človek má mať jeden účet. Používateľské meno nesmie byť urážlivé ani sa vydávať za niekoho iného.",
          "Účet môžeš kedykoľvek zrušiť – napíš na {email}.",
        ],
      },
      {
        heading: "Nahrávanie modifikácií",
        paragraphs: ["Nahrať smieš iba obsah, ku ktorému máš práva. Konkrétne:"],
        items: [
          "vlastné dielo, alebo cudzie dielo s výslovným povolením autora (uveď ho v kreditoch),",
          "repaint či úpravu cudzieho modu iba ak to licencia pôvodného autora dovoľuje,",
          "žiadne súbory z platených DLC, žiadne cracky ani obchádzanie ochrany hry,",
          "žiadny škodlivý kód, skryté spustiteľné súbory ani zavádzajúce súbory,",
          "žiadny nezákonný, nenávistný ani inak nevhodný obsah v popisoch a obrázkoch.",
        ],
      },
      {
        heading: "Licencia pre portál",
        paragraphs: [
          "Nahraním obsahu ostávaš jeho autorom. Prevádzkovateľovi udeľuješ bezplatné nevýhradné oprávnenie obsah uložiť, skontrolovať, zobraziť a sprístupniť na stiahnutie na portáli, a to až do jeho odstránenia. Obsah inde nepredávame ani nepoužívame.",
        ],
      },
      {
        heading: "Komunita",
        items: [
          "Recenzie a komentáre majú byť vecné. Urážky, spam, reklama a zverejňovanie cudzích osobných údajov sú zakázané.",
          "Hlásenie chyby patrí autorovi modu – priprav popis, postup a ak môžeš, logfile.txt.",
          "Obsah, ktorý porušuje pravidlá, nahlás tlačidlom Nahlásiť pri mode, recenzii alebo komentári.",
        ],
      },
      {
        heading: "Moderácia",
        paragraphs: [
          "Moderátori môžu obsah, ktorý porušuje tieto podmienky alebo práva iných, skryť, vrátiť na úpravu alebo odstrániť a pri závažnom či opakovanom porušení obmedziť alebo zablokovať účet. Autor dostane dôvod rozhodnutia v upozornení. S rozhodnutím môžeš nesúhlasiť – napíš na {email} a pozrie sa naň niekto iný.",
        ],
      },
      {
        heading: "Porušenie autorských práv",
        paragraphs: [
          "Ak je na portáli tvoje dielo bez tvojho súhlasu, postupuj podľa stránky Kontakt. Po overení oznámenia obsah bez zbytočného odkladu znepristupníme. Kto opakovane nahráva cudzie diela, príde o účet.",
        ],
      },
      {
        heading: "Zodpovednosť",
        paragraphs: [
          "Portál prevádzkujeme bezplatne a bez záruky nepretržitej dostupnosti. Za obsah modifikácií zodpovedajú ich autori; prevádzkovateľ zodpovedá za obsah tretích strán iba ak po upozornení na protiprávny obsah nekonal. Nezodpovedáme za škodu spôsobenú nesprávnou inštaláciou alebo nekompatibilitou modifikácií.",
        ],
      },
      {
        heading: "Záverečné ustanovenia",
        paragraphs: [
          "Tieto podmienky sa riadia právom Slovenskej republiky. Pri podstatnej zmene ťa upozorníme na portáli alebo emailom; pokračovaním v používaní so zmenou súhlasíš.",
        ],
      },
    ],
  },

  contact: {
    title: "Kontakt",
    description: "Ako kontaktovať prevádzkovateľa portálu {site} – autorské práva, osobné údaje, bezpečnosť.",
    updated: UPDATED,
    intro:
      "Na otázky k portálu, nahlásenie porušenia práv alebo žiadosti o osobných údajoch nám napíš na {email}. Prevádzkovateľ: {operator}.",
    sections: [
      {
        heading: "Obsah na portáli porušuje autorské práva",
        paragraphs: ["Sme kontaktným miestom podľa nariadenia o digitálnych službách (DSA). Pošli oznámenie na {email}. Aby sme ho vedeli rýchlo vybaviť, uveď:"],
        items: [
          "odkaz na mod alebo súbor na portáli,",
          "čo je tvojím dielom a odkaz na pôvodné zverejnenie (napr. fórum, vlastný web),",
          "svoje meno a kontakt,",
          "vyhlásenie, že oznámenie podávaš v dobrej viere a údaje sú pravdivé.",
        ],
      },
      {
        heading: "Iný nevhodný obsah",
        paragraphs: [
          "Recenzie, komentáre, mody a používateľov nahlásiš najrýchlejšie tlačidlom Nahlásiť priamo na stránke – nahlásenie hneď uvidia moderátori. Bez účtu napíš na {email}.",
        ],
      },
      {
        heading: "Osobné údaje a zrušenie účtu",
        paragraphs: [
          "Žiadosť o kópiu údajov, opravu alebo zmazanie účtu pošli na {email} z adresy, ktorú máš pri účte. Viac v časti Ochrana osobných údajov.",
        ],
      },
      {
        heading: "Bezpečnostná chyba",
        paragraphs: [
          "Našiel si zraniteľnosť? Napíš na {email} s popisom a postupom. Nezverejňuj ju, kým ju neopravíme, a neskúšaj ju na cudzích účtoch ani dátach.",
        ],
      },
    ],
  },
};

const cs: Record<LegalDocumentName, LegalDocument> = {
  privacy: {
    title: "Ochrana osobních údajů",
    description: "Jaké osobní údaje {site} zpracovává, proč, jak dlouho je uchovává a jaká máš práva.",
    updated: UPDATED,
    intro:
      "Ke stahování modifikací nepotřebuješ účet a nesbíráme o tobě nic, co by tě přímo identifikovalo. Tato stránka vysvětluje, jaké údaje zpracováváme při stahování a při používání účtu.",
    sections: [
      {
        heading: "Správce",
        paragraphs: [
          "Provozovatel portálu {site} a správce osobních údajů: {operator}. Ve věcech ochrany osobních údajů nás kontaktuj na {email}.",
        ],
      },
      {
        heading: "Jaké údaje zpracováváme",
        items: [
          "Účet: uživatelské jméno, zobrazované jméno, email, heslo (uložené pouze jako hash Argon2id, nikdy v čitelné podobě), jazyk a role.",
          "Přihlášení přes Discord (pokud ho použiješ): identifikátor účtu Discord, jméno a email, které nám Discord předá.",
          "Přihlášení: při každém přihlášení uložíme IP adresu a identifikaci prohlížeče (user agent) k dané relaci.",
          "Obsah, který přidáš: modifikace, soubory, obrázky, popisy, recenze, komentáře, hlášení chyb a nahlášení.",
          "IP adresa návštěvníka: neukládáme ji v čitelné podobě, pouze jako jednosměrný kryptografický otisk (HMAC-SHA256). Slouží k ochraně před zneužitím (limity pokusů), k započítání stažení jednou za 24 hodin a v bezpečnostním záznamu.",
          "Technické cookies (viz níže).",
        ],
      },
      {
        heading: "Proč a na jakém právním základě",
        items: [
          "Vytvoření a vedení účtu, nahrávání a zveřejňování obsahu – plnění smlouvy, tedy těchto podmínek užívání (čl. 6 odst. 1 písm. b GDPR).",
          "Bezpečnost portálu, ochrana před spamem, boty a útoky na účty, bezpečnostní záznam a statistiky stahování – oprávněný zájem správce (čl. 6 odst. 1 písm. f GDPR).",
          "Emaily: ověření adresy, obnova hesla a upozornění, která si zapneš v nastavení účtu. Upozornění můžeš kdykoli vypnout.",
        ],
        paragraphs: ["Údaje neprodáváme, nepoužíváme k reklamě ani k profilování a nečiníme na jejich základě automatizovaná rozhodnutí."],
      },
      {
        heading: "Jak dlouho údaje uchováváme",
        items: [
          "Účet a obsah: dokud účet existuje. Po smazání účtu odstraníme i tvé recenze, komentáře, hlášení a modifikace.",
          "Relace přihlášení (včetně IP adresy a identifikace prohlížeče): nejvýše 30 dní, poté se automaticky mažou.",
          "Počítadla limitů pokusů: nejvýše 1 hodinu. Záznam o stažení pro započítání: 24 hodin.",
          "Záznamy o stažení pro statistiky (otisk IP, soubor, čas): 90 dní.",
          "Bezpečnostní záznam (např. přihlášení, změny rolí, rozhodnutí moderátorů): 1 rok.",
          "Nedokončené a nepřipojené uploady: 24 hodin, hotový nepřipojený upload 7 dní.",
        ],
      },
      {
        heading: "Komu údaje předáváme",
        paragraphs: ["Údaje zpracováváme na vlastním serveru. Při provozu využíváme tyto zpracovatele:"],
        items: [
          "Cloudflare, Inc. – doručování stránky, ochrana před útoky a ověření Turnstile proti botům. Přenos do USA je krytý rámcem EU–US Data Privacy Framework a standardními smluvními doložkami.",
          "Poskytovatel odesílání emailů – doručuje ověřovací a upozorňovací emaily (zpracovává tvou emailovou adresu a obsah zprávy).",
          "Discord Inc. – pouze pokud se rozhodneš přihlásit přes Discord.",
          "VirusTotal (Google) – antivirová kontrola souborů modů. Soubor kontrolujeme nejprve podle otisku SHA-256; pokud ho VirusTotal nezná, nahrajeme ho tam až po veřejném zveřejnění modu. Nahrané soubory jsou dostupné bezpečnostní komunitě VirusTotalu. Osobní údaje do VirusTotalu neposíláme.",
        ],
      },
      {
        heading: "Cookies",
        paragraphs: [
          "Používáme pouze cookies nezbytné pro fungování portálu, proto nepotřebujeme tvůj souhlas a nezobrazujeme cookie lištu. Nepoužíváme analytiku ani reklamní cookies.",
        ],
        items: [
          "omsi.* – přihlášení a bezpečnost relace (platnost do odhlášení, nejvýše 30 dní).",
          "locale a theme – zapamatovaný jazyk a barevný režim.",
          "Technické cookies Cloudflare (např. __cf_bm) – ochrana před automatizovanými útoky.",
        ],
      },
      {
        heading: "Tvá práva",
        items: [
          "přístup k údajům a jejich kopie (i v přenositelném formátu),",
          "oprava nesprávných údajů – jméno a profil upravíš i sám v nastavení účtu,",
          "výmaz údajů a účtu,",
          "omezení zpracování a námitka proti zpracování na základě oprávněného zájmu,",
          "stížnost u Úřadu pro ochranu osobních údajů (uoou.gov.cz), na Slovensku u Úradu na ochranu osobných údajov SR (dataprotection.gov.sk).",
        ],
        paragraphs: ["Žádost pošli na {email} z adresy, kterou máš u účtu. Vyřídíme ji bez zbytečného odkladu, nejpozději do 30 dní."],
      },
      {
        heading: "Věk",
        paragraphs: ["Účet si můžeš založit od 16 let. Pokud je ti méně, potřebuješ souhlas rodiče nebo zákonného zástupce. Stahovat může kdokoli bez účtu."],
      },
      {
        heading: "Změny",
        paragraphs: ["Při podstatné změně těchto zásad tě upozorníme na portálu nebo emailem. Datum poslední změny je uvedeno nahoře."],
      },
    ],
  },

  terms: {
    title: "Podmínky užívání",
    description: "Pravidla portálu {site} pro stahování, nahrávání a chování v komunitě.",
    updated: UPDATED,
    intro:
      "{site} je komunitní portál pro sdílení modifikací pro OMSI 2. Používáním portálu souhlasíš s těmito pravidly. Píšeme je srozumitelně – pokud ti něco není jasné, napiš nám na {email}.",
    sections: [
      {
        heading: "Stahování",
        items: [
          "Stahování je zdarma a bez registrace.",
          "Modifikace jsou dílem jejich autorů, nikoli provozovatele. U každé jsou uvedeny licenční podmínky autora (např. zákaz dalšího zveřejnění, povolené repainty) – dodržuj je.",
          "Soubory automaticky kontrolujeme (typ souboru, obsah archivu, nebezpečné soubory, antiviry přes VirusTotal) a pluginy .dll schvaluje moderátor. Zveřejněním modu souhlasíš, že jeho soubory můžeme poslat ke kontrole do VirusTotalu. Přesto nemůžeme zaručit, že je každý soubor bezchybný – stahuješ a instaluješ na vlastní odpovědnost a doporučujeme zálohovat složku OMSI.",
          "Odkaz ke stažení je určen pro tebe a platí omezenou dobu. Hromadné stahování roboty a sdílení přímých odkazů na soubory není dovoleno.",
        ],
      },
      {
        heading: "Účet",
        items: [
          "Uváděj pravdivý email a chraň své heslo. Za činnost ze svého účtu odpovídáš ty.",
          "Jeden člověk má mít jeden účet. Uživatelské jméno nesmí být urážlivé ani se vydávat za někoho jiného.",
          "Účet můžeš kdykoli zrušit – napiš na {email}.",
        ],
      },
      {
        heading: "Nahrávání modifikací",
        paragraphs: ["Nahrát smíš pouze obsah, ke kterému máš práva. Konkrétně:"],
        items: [
          "vlastní dílo, nebo cizí dílo s výslovným svolením autora (uveď ho v kreditech),",
          "repaint či úpravu cizího modu pouze pokud to licence původního autora dovoluje,",
          "žádné soubory z placených DLC, žádné cracky ani obcházení ochrany hry,",
          "žádný škodlivý kód, skryté spustitelné soubory ani zavádějící soubory,",
          "žádný nezákonný, nenávistný ani jinak nevhodný obsah v popisech a obrázcích.",
        ],
      },
      {
        heading: "Licence pro portál",
        paragraphs: [
          "Nahráním obsahu zůstáváš jeho autorem. Provozovateli uděluješ bezplatné nevýhradní oprávnění obsah uložit, zkontrolovat, zobrazit a zpřístupnit ke stažení na portálu, a to až do jeho odstranění. Obsah jinde neprodáváme ani nepoužíváme.",
        ],
      },
      {
        heading: "Komunita",
        items: [
          "Recenze a komentáře mají být věcné. Urážky, spam, reklama a zveřejňování cizích osobních údajů jsou zakázány.",
          "Hlášení chyby patří autorovi modu – připrav popis, postup a pokud můžeš, logfile.txt.",
          "Obsah, který porušuje pravidla, nahlas tlačítkem Nahlásit u modu, recenze nebo komentáře.",
        ],
      },
      {
        heading: "Moderace",
        paragraphs: [
          "Moderátoři mohou obsah, který porušuje tyto podmínky nebo práva jiných, skrýt, vrátit k úpravě nebo odstranit a při závažném či opakovaném porušení omezit nebo zablokovat účet. Autor dostane důvod rozhodnutí v upozornění. S rozhodnutím můžeš nesouhlasit – napiš na {email} a podívá se na něj někdo jiný.",
        ],
      },
      {
        heading: "Porušení autorských práv",
        paragraphs: [
          "Pokud je na portálu tvé dílo bez tvého souhlasu, postupuj podle stránky Kontakt. Po ověření oznámení obsah bez zbytečného odkladu znepřístupníme. Kdo opakovaně nahrává cizí díla, přijde o účet.",
        ],
      },
      {
        heading: "Odpovědnost",
        paragraphs: [
          "Portál provozujeme zdarma a bez záruky nepřetržité dostupnosti. Za obsah modifikací odpovídají jejich autoři; provozovatel odpovídá za obsah třetích stran pouze pokud po upozornění na protiprávní obsah nekonal. Neodpovídáme za škodu způsobenou nesprávnou instalací nebo nekompatibilitou modifikací.",
        ],
      },
      {
        heading: "Závěrečná ustanovení",
        paragraphs: [
          "Tyto podmínky se řídí právem Slovenské republiky. Při podstatné změně tě upozorníme na portálu nebo emailem; pokračováním v používání se změnou souhlasíš.",
        ],
      },
    ],
  },

  contact: {
    title: "Kontakt",
    description: "Jak kontaktovat provozovatele portálu {site} – autorská práva, osobní údaje, bezpečnost.",
    updated: UPDATED,
    intro:
      "S dotazy k portálu, nahlášením porušení práv nebo žádostmi o osobních údajích nám napiš na {email}. Provozovatel: {operator}.",
    sections: [
      {
        heading: "Obsah na portálu porušuje autorská práva",
        paragraphs: ["Jsme kontaktním místem podle nařízení o digitálních službách (DSA). Pošli oznámení na {email}. Abychom ho mohli rychle vyřídit, uveď:"],
        items: [
          "odkaz na mod nebo soubor na portálu,",
          "co je tvým dílem a odkaz na původní zveřejnění (např. fórum, vlastní web),",
          "své jméno a kontakt,",
          "prohlášení, že oznámení podáváš v dobré víře a údaje jsou pravdivé.",
        ],
      },
      {
        heading: "Jiný nevhodný obsah",
        paragraphs: [
          "Recenze, komentáře, mody a uživatele nahlásíš nejrychleji tlačítkem Nahlásit přímo na stránce – nahlášení hned uvidí moderátoři. Bez účtu napiš na {email}.",
        ],
      },
      {
        heading: "Osobní údaje a zrušení účtu",
        paragraphs: [
          "Žádost o kopii údajů, opravu nebo smazání účtu pošli na {email} z adresy, kterou máš u účtu. Více v části Ochrana osobních údajů.",
        ],
      },
      {
        heading: "Bezpečnostní chyba",
        paragraphs: [
          "Našel jsi zranitelnost? Napiš na {email} s popisem a postupem. Nezveřejňuj ji, dokud ji neopravíme, a nezkoušej ji na cizích účtech ani datech.",
        ],
      },
    ],
  },
};

export const LEGAL: Record<AppLocale, Record<LegalDocumentName, LegalDocument>> = { sk, cs };
