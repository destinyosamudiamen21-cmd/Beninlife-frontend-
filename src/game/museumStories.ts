// What the National Museum tells: the history of the Benin Kingdom, one case or plaque at
// a time. Walk up to one and its story opens, read aloud if the player wants.
//
// Dates before the 1800s come from court tradition and from what historians have
// pieced together; where they are not certain the text says "around". Change the words
// here: nothing else needs to change. Each page is a few sentences, short enough to hear
// in one breath.

export type Story = {
  id: string;
  /** On the plaque. */
  title: string;
  /** Under the title: when. */
  era: string;
  pages: string[];
};

export const STORIES: Story[] = [
  {
    id: "ogiso",
    title: "Igodomigodo: the land of the Ogiso",
    era: "More than a thousand years ago",
    pages: [
      "Long before the city had the name Benin, the Edo called their kingdom Igodomigodo. Its first rulers were the Ogiso: the name means \"king of the sky\".",
      "Court tradition counts thirty-one Ogiso, from the first, Igodo, to the last, Owodo. Under them the Edo farmed, traded and worked iron and wood, and their villages grew into a kingdom.",
      "The rule of the Ogiso ended in trouble. Owodo was driven out after his only son, Prince Ekaladerhan, was sent into exile. For a time the kingdom had no king at all.",
    ],
  },
  {
    id: "eweka",
    title: "Oranmiyan, and the first Oba",
    era: "Around the 1200s",
    pages: [
      "With no king, the elders of Benin sent to Ile-Ife for a ruler. Tradition says the man they reached there was Ekaladerhan himself, the lost prince, now known in Ife as Oduduwa.",
      "He sent his son, Prince Oranmiyan. Oranmiyan did not stay. Tradition says he called the land Ile-Ibinu, \"the land of vexation\", because it was so hard to rule. Some say that is where the name Benin comes from.",
      "Before he left, Oranmiyan had a son with Erinmwinde, daughter of an Edo chief. That son became Eweka the First, the first Oba of Benin. Every Oba since has come from his line.",
    ],
  },
  {
    id: "ewuare",
    title: "Oba Ewuare the Great",
    era: "Reigned around 1440 to 1473",
    pages: [
      "Ewuare took the throne by force after years in exile. The city burned in the fighting, and he rebuilt it on a grand plan, with broad streets and the palace at its heart.",
      "He named the city Edo. He strengthened the walls and moats, organised the craftsmen into guilds that served the palace, and set up the councils of chiefs that still advise the Oba today.",
      "Under Ewuare, Benin grew from a city into an empire. Many of the festivals and titles of the Benin court are said to have begun in his reign.",
    ],
  },
  {
    id: "emotan",
    title: "Emotan of Oba Market",
    era: "The time of Ewuare",
    pages: [
      "Emotan was a market woman who sold her goods where Oba Market stands today. When Prince Ewuare was hiding from his enemies, she sheltered him and warned him of danger.",
      "When Ewuare became Oba, he did not forget her. After she died he honoured her where her stall had been, and ordered that people should pay respect to her at that spot.",
      "Her statue stands near Oba Market, put up in 1954. Brides, traders and passers-by still stop to greet her. In this game you can walk to Oba Market from Ring Road.",
    ],
  },
  {
    id: "walls",
    title: "The walls and moats: the Iya",
    era: "Dug over hundreds of years",
    pages: [
      "Around the city and across the kingdom, the Edo dug moats and piled the earth into walls. They call them Iya. The inner walls around the city stood many metres from the bottom of the ditch to the top of the bank.",
      "Counted together, the walls and ditches of the Benin region may have run for thousands of kilometres. The researcher Patrick Darling estimated around sixteen thousand kilometres, built by hand over centuries.",
      "In 1974 the Guinness Book of Records listed them among the largest earthworks made before machines. Most have been flattened by roads and houses, but you can still find stretches of the old moat in Benin City today.",
    ],
  },
  {
    id: "portuguese",
    title: "Strangers from the sea",
    era: "From the 1480s",
    pages: [
      "In the 1480s Portuguese ships reached the coast, and an envoy, João Afonso de Aveiro, came to the court of Benin. The Oba sent an ambassador back with him to Portugal.",
      "Benin traded pepper, ivory, cloth and coral beads. The Portuguese brought brass and copper in great quantity, often as bracelets called manillas. That metal fed the furnaces of the bronze casters.",
      "European visitors wrote that Benin City was large, clean and well ordered, with long straight streets. A Dutch account from the 1600s compares its streets to those of Amsterdam.",
    ],
  },
  {
    id: "idia",
    title: "Queen Idia, the first Iyoba",
    era: "Early 1500s",
    pages: [
      "Idia was the mother of Oba Esigie, who reigned in the early 1500s. When Benin went to war with the Igala kingdom of Idah, she raised her own army and went to the front.",
      "Esigie made her the first Iyoba, the Queen Mother, with her own palace and court at Uselu. The title has been given to the Oba's mother ever since.",
      "An ivory mask of her face, worn by the Oba at ceremonies, is one of the most famous objects in Africa. Its image became the emblem of FESTAC 77, the great festival of African culture held in Lagos in 1977. The original was taken in 1897.",
    ],
  },
  {
    id: "igun",
    title: "Igun Eronmwon: the bronze casters",
    era: "From the time of the early Obas to today",
    pages: [
      "The casters of Benin belong to a guild, the Igun Eronmwon, that works for the Oba. Tradition says the craft was brought from Ife in the time of an early Oba, Oguola. The guild lives on Igun Street, close to the palace.",
      "They cast by lost wax. The figure is shaped in wax over a clay core, covered in more clay, then heated so the wax runs out. Molten brass is poured into the space the wax has left, and the mould is broken to free the figure.",
      "Every piece is made once: the mould is destroyed to get it out. The guild still casts on Igun Street, and you can watch them work there in this game.",
    ],
  },
  {
    id: "plaques",
    title: "The plaques of the palace",
    era: "Around 1500 to 1700",
    pages: [
      "For about two hundred years the casters made rectangular brass plaques, and the palace pillars were covered with them. There were around nine hundred.",
      "They show the court: the Oba with his attendants, warriors with their weapons, chiefs, musicians, hunters, and Portuguese traders with long hair and helmets.",
      "Historians read them as a record of the kingdom's life. They were in storage at the palace when the British came in 1897. Almost all of them are now outside Nigeria.",
    ],
  },
  {
    id: "coral",
    title: "Coral beads: the mark of the Oba",
    era: "Every reign",
    pages: [
      "Red coral beads, ivie in Edo, belong to the Oba. His crown, his collar and his robes are made of them, and on great occasions he wears so many that he has to be supported.",
      "Chiefs wear coral that the Oba grants them. Every year at the bead festival, Ugie Ivie, the beads are honoured at the palace.",
      "That is why brides and grooms in Benin wear coral at their weddings to this day: it is the colour of royalty, and of the city.",
    ],
  },
  {
    id: "1897",
    title: "1897: the burning of the city",
    era: "January and February 1897",
    pages: [
      "By the 1890s the British controlled the coast and wanted Benin's trade. In January 1897 the acting Consul-General, James Phillips, set out for Benin City during a sacred festival, against the Oba's wishes and without orders from London.",
      "His party was attacked on the road and Phillips and most of the British officers with him were killed. Within weeks a British force of around twelve hundred men under Admiral Harry Rawson marched on the city.",
      "Benin City was taken in February 1897. The palace and much of the city burned. Thousands of brass, ivory and wooden works were carried off. Some went to the British Museum; many were sold to pay for the expedition.",
    ],
  },
  {
    id: "ovonramwen",
    title: "Oba Ovonramwen in exile",
    era: "1897 to 1914",
    pages: [
      "Oba Ovonramwen escaped into the forest, then returned and surrendered. The British put him on trial and sent him into exile in Calabar, far to the east.",
      "He lived there for the rest of his life and died in 1914 without seeing his city again. For seventeen years, Benin had no Oba on its throne.",
      "A square in the centre of Benin City bears his name today, in his honour.",
    ],
  },
  {
    id: "eweka2",
    title: "The throne restored",
    era: "1914 to today",
    pages: [
      "In 1914 the British allowed the monarchy to return. Ovonramwen's son was crowned Oba Eweka the Second and began to rebuild the palace and to bring the casters and craftsmen back to work.",
      "After him came Oba Akenzua the Second, then Oba Erediauwa, who reigned from 1979 to 2016. In 2016, Oba Ewuare the Second was crowned, taking the name of the great Ewuare.",
      "The Oba is not a politician, but he is at the heart of Edo life: festivals, titles, chieftaincy and the memory of the kingdom pass through the palace.",
    ],
  },
  {
    id: "return",
    title: "Coming home: the bronzes return",
    era: "2021 onwards",
    pages: [
      "For over a century, Benin's works were in museums and private collections abroad: more than five thousand objects in about a hundred and sixty institutions, by one count.",
      "In 2021 the University of Aberdeen and Jesus College, Cambridge returned works, including a brass cockerel, the Okukor. In 2022 Germany transferred ownership of over a thousand objects to Nigeria, and the Smithsonian in America agreed to return twenty-nine.",
      "Many are still away. The British Museum holds around nine hundred and has returned none. The question of where they belong, and who should keep them, is still being argued in Benin and around the world.",
    ],
  },
  {
    id: "olokun",
    title: "Osanobua, Olokun and the spirit world",
    era: "Edo belief",
    pages: [
      "In Edo belief, Osanobua is the creator. His son Olokun rules the waters and brings wealth, children and good fortune. His shrines are kept white with chalk.",
      "Ogun is the spirit of iron and of all who work with it. The ancestors watch over their families, and are honoured at family altars.",
      "At the end of each year the Oba performs Igue, a festival of renewal and blessing for himself and the kingdom. Families across Edo hold their own Igue at home.",
    ],
  },
];

/** The model in the middle of the room: what it is, for its plaque. */
export const DIORAMA: Story = {
  id: "diorama",
  title: "Model: the ancient city of Edo",
  era: "As visitors described it in the 1600s",
  pages: [
    "This model shows the old city as it might have looked in its golden age. In the middle is the palace of the Oba, a city of its own, with courtyards, galleries and turrets topped with brass birds.",
    "Around it lie the wards of the guilds: the bronze casters, the ivory carvers, the weavers, the drummers. Wide, straight streets run between them.",
    "Around everything runs the great wall and moat, the Iya, with gates that were shut at night. Ring Road, where this museum stands, follows the line of the old city centre.",
  ],
};
