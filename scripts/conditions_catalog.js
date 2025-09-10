// scripts/conditions_catalog.js
// Public catalog of 5e conditions + descriptions.
// Exposes window.ConditionsCatalog with { list: [...names], get(name): {name, desc} }

(() => {
  const C = [
    {
      name: "Blinded",
      desc: [
        "Can't see; automatically fails any ability check that requires sight.",
        "Attack rolls against the creature have advantage.",
        "The creature's attack rolls have disadvantage."
      ]
    },
    {
      name: "Charmed",
      desc: [
        "Can't attack the charmer or target the charmer with harmful abilities or magical effects.",
        "The charmer has advantage on any ability check to interact socially with the creature."
      ]
    },
    {
      name: "Deafened",
      desc: [
        "Can't hear; automatically fails any ability check that requires hearing."
      ]
    },
    {
      name: "Frightened",
      desc: [
        "Disadvantage on ability checks and attack rolls while the source of fear is in line of sight.",
        "Can't willingly move closer to the source of fear."
      ]
    },
    {
      name: "Grappled",
      desc: [
        "Speed becomes 0 and can't benefit from any bonus to speed.",
        "Ends if the grappler is incapacitated.",
        "Ends if an effect removes the grappled creature from the grappler's reach."
      ]
    },
    {
      name: "Incapacitated",
      desc: ["Can't take actions or reactions."]
    },
    {
      name: "Invisible",
      desc: [
        "Impossible to see without magic/special sense; heavily obscured for hiding.",
        "Location can be detected by noise or tracks.",
        "Attack rolls against the creature have disadvantage.",
        "The creature's attack rolls have advantage."
      ]
    },
    {
      name: "Paralyzed",
      desc: [
        "Incapacitated; can't move or speak.",
        "Automatically fails Strength and Dexterity saving throws.",
        "Attack rolls against the creature have advantage.",
        "Any attack that hits is a critical hit if the attacker is within 5 feet."
      ]
    },
    {
      name: "Petrified",
      desc: [
        "Transformed (with worn/carrying nonmagical gear) into solid inanimate substance; weight ×10; ceases aging.",
        "Incapacitated, can't move or speak, unaware of surroundings.",
        "Attack rolls against the creature have advantage.",
        "Automatically fails Strength and Dexterity saving throws.",
        "Has resistance to all damage.",
        "Immune to poison and disease; any current poison/disease is suspended."
      ]
    },
    {
      name: "Poisoned",
      desc: ["Disadvantage on attack rolls and ability checks."]
    },
    {
      name: "Prone",
      desc: [
        "Only movement option is crawl, unless it stands up (ending prone).",
        "Disadvantage on attack rolls.",
        "Attack rolls against the creature have advantage if the attacker is within 5 feet; otherwise, disadvantage."
      ]
    },
    {
      name: "Restrained",
      desc: [
        "Speed becomes 0 and can't benefit from any bonus to speed.",
        "Attack rolls against the creature have advantage.",
        "The creature's attack rolls have disadvantage.",
        "Disadvantage on Dexterity saving throws."
      ]
    },
    {
      name: "Stunned",
      desc: [
        "Incapacitated, can't move, can speak only falteringly.",
        "Automatically fails Strength and Dexterity saving throws.",
        "Attack rolls against the creature have advantage."
      ]
    },
    {
      name: "Unconscious",
      desc: [
        "Incapacitated, can't move or speak, unaware of surroundings.",
        "Drops whatever is holding and falls prone.",
        "Automatically fails Strength and Dexterity saving throws.",
        "Attack rolls against the creature have advantage.",
        "Any attack that hits is a critical hit if the attacker is within 5 feet."
      ]
    },
    // Optional utility tag used by many tables:
    { name: "Concentrating", desc: ["Maintaining concentration on a spell/effect; subject to concentration checks."] }
  ];

  const map = new Map(C.map(x => [x.name, x]));
  window.ConditionsCatalog = {
    list: C.map(x => x.name),
    get: (name) => map.get(name) || null
  };
})();
