const CLAN_SHOP_OFFERS = [
  {
    id: "boost_xp_small",
    title: "Клановый XP-буст",
    description: "+5% XP для клана (декор-метка сезона)",
    cost: 20
  },
  {
    id: "banner_neon",
    title: "Неоновое знамя",
    description: "Открывает клановый баннер в профиле",
    cost: 35
  },
  {
    id: "tag_gold",
    title: "Золотой тег",
    description: "Золотая метка клана в списках",
    cost: 50
  },
  {
    id: "effect_warflare",
    title: "Эффект Warflare",
    description: "Новый визуальный эффект для клана",
    cost: 70
  }
];

function getClanShopOffer(itemId) {
  return CLAN_SHOP_OFFERS.find((item) => item.id === itemId) || null;
}

module.exports = {
  CLAN_SHOP_OFFERS,
  getClanShopOffer
};
