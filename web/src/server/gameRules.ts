import { AUTO_EXPLORE_RULES } from "@/shared/autoExplore";
import { PARTY_POWER_TO_COMBAT, RAID_ENEMY_STAT_MULT } from "@/shared/combatBalance";
import { DUNGEON_MIN_PARTY_LEVEL_RATIO } from "@/shared/dungeonDifficulty";
import { RAID_MIN_PARTY_POWER_RATIO } from "@/shared/raidDifficulty";
import { MAX_EQUIPMENT_OWNED } from "@/shared/equipmentCapacity";
import { DEFAULT_KNIGHT_ORDER_RULES } from "@/shared/knightOrder";
import { MINION_LEVEL_RULES } from "@/shared/minionLevel";
import { MINION_SKILL_RULES } from "@/shared/minionSkills";
import { LOOT_OPTION_MAX_SLOTS, LOOT_OPTION_SLOTS_BY_GRADE } from "@/shared/lootOptionBalance";
import { ARMOR_LEVEL_STAT_PCT_PER_LEVEL } from "@/shared/armorEnhanceRules";
import {
  WEAPON_BASE_POWER_BY_ITEM_ID,
  WEAPON_ENHANCE_POWER_RATIO,
  WEAPON_LEVEL_POWER_PER_LEVEL,
} from "@/shared/weaponPowerRules";

export const GAME_RULES = {
  combat: {
    /** 전투력 → HP/공격 환산 — `shared/combatBalance.ts` */
    partyPowerToCombat: PARTY_POWER_TO_COMBAT,
    /** 레이드 적 스탯 배율 */
    raidEnemyStatMult: RAID_ENEMY_STAT_MULT,
    /** 레이드 입장 최소 파티 전투력 = 권장 × 비율 */
    raidMinPartyPowerRatio: RAID_MIN_PARTY_POWER_RATIO,
    /** 던전 입장 최소 파티 평균 레벨 = 권장 하한 × 비율 (전투력 제한 없음) */
    dungeonMinPartyLevelRatio: DUNGEON_MIN_PARTY_LEVEL_RATIO,
    /** 무기 전투력(미니언 개별 장착) */
    weaponPowerByItemId: WEAPON_BASE_POWER_BY_ITEM_ID,
    /** 장착 무기 강화 1단계당 추가 전투력 — 베이스 CP × `WEAPON_ENHANCE_POWER_RATIO` (최소 1) */
    weaponLevelPowerPerLevel: WEAPON_LEVEL_POWER_PER_LEVEL,
    weaponEnhancePowerRatio: WEAPON_ENHANCE_POWER_RATIO,
    /** 방어구 강화 1단계당 베이스 HP·DEF 추가 비율 */
    armorLevelStatPctPerLevel: ARMOR_LEVEL_STAT_PCT_PER_LEVEL,
    /** 미니언 기본 전투력(아직 레벨/스탯이 없어서 고정값으로 시작) */
    baseMinionPower: 5,
    /** 승률 하한/상한 */
    winRateClamp: { min: 0.05, max: 0.95 },
    /** 미니언 레벨 1 증가당 전투력 보너스 */
    levelPowerPerLevel: 1,
    /** 전투 특성 랭크 1당 전투력 보너스 */
    fighterTraitPowerPerRank: 3,
  },
  /** 무기·방어구 인스턴스 합산 보유 상한 — `shared/equipmentCapacity.ts` */
  equipment: {
    maxOwned: MAX_EQUIPMENT_OWNED,
    /** 전투 드랍 옵션 — 등급별 슬롯(2/4/6)·천·마계 풀 후보 수 */
    lootOptions: {
      maxSlots: LOOT_OPTION_MAX_SLOTS,
      slotsByGrade: LOOT_OPTION_SLOTS_BY_GRADE,
    },
  },
  /** 기사단(유니온) — 보유 미니언 총 레벨 합산 보너스 */
  knightOrder: DEFAULT_KNIGHT_ORDER_RULES,
  /** 미니언 보유 상한 */
  minion: {
    maxDungeonOwned: 10,
    /** 레벨·경험치·스탯 배분 — `shared/minionLevel.ts` */
    levelUp: {
      maxLevel: MINION_LEVEL_RULES.maxLevel,
      statPointsPerLevel: MINION_LEVEL_RULES.statPointsPerLevel,
      maxStatPerAttribute: MINION_LEVEL_RULES.maxStatPerAttribute,
    },
    skill: {
      pointsPerLevel: MINION_SKILL_RULES.pointsPerLevel,
      promotionBonusPoints: MINION_SKILL_RULES.promotionBonusPoints,
    },
    /** 기본 4스탯 — 전투력 환산 가중치(스탯 1당) */
    baseStats: {
      powerPerStrength: 0.28,
      powerPerAgility: 0.24,
      powerPerIntelligence: 0.24,
      powerPerEndurance: 0.28,
    },
  },
  /** 황실 — DB 가격 없을 때 referenceGold 폴백 */
  royal: {
    fallbackBuyMult: 1.12,
    fallbackSellMult: 0.88,
  },
  /** 장착 무기 강화 — 비용 `weapon_enhance_levels.json`, 등급별 상한은 `shared/weaponEnhanceLimits` */
  weaponUpgrade: {
    maxLevel: 30,
  },
  /** 자동 탐험(AUTO_WAVES) — 배속 BM, 상세는 `shared/autoExplore.ts` */
  autoExplore: AUTO_EXPLORE_RULES,
  market: {
    feeBps: 500, // 5%
    /** 유저당 동시 ACTIVE 매물 상한 */
    maxActiveListingsPerUser: 20,
    /** 매물(고정가·경매) 판매 기간 — 등록 시점부터 */
    listingDurationSeconds: 48 * 60 * 60,
  },
  reputation: {
    /** 명예가 이 이상이면 암시장 이용 불가 */
    honorBlocksBlackMarketAt: 50_000,
    /** 악명이 이 이상이면 황실 이용 불가 */
    infamyBlocksRoyalAt: 20_000,
  },
  auction: {
    /** 신규 경매 endsAt — `market.listingDurationSeconds`와 동일하게 유지 */
    baseDurationSeconds: 48 * 60 * 60,
    extendWindowSeconds: 60,
    extendBySeconds: 5 * 60,
    minBid: {
      fixedIncrement: 1,
      percent: 0.05,
    },
  },
  minions: {
    basePrice: 100,
    growth: 1.15,
  },
  bots: {
    /** `BOT_COUNT` 환경변수가 없을 때 쓰는 기본 봇 수 */
    count: 5,
    usernamePrefix: "market_bot_",
    /** KST 기준 하루 동안 고정가 매수에 쓸 수 있는 총액(지갑과 별도 상한) */
    dailyBuyBudgetGold: 5000,
    /** 평균 단가 대비 허용 편차(0.10 = ±10%) */
    priceBand: 0.1,
    /** 조건을 만족할 때 실제로 매수 시도까지 갈 확률 */
    buyProbability: 0.3,
    statsLookbackTrades: 50,
    /** 틱당 봇이 한 번에 사려는 최대 수량(시장 과열 완화) */
    maxBuyQtyPerTick: 3,
    /** 틱당 봇이 한 번에 올리는 최대 판매 수량 */
    maxSellQtyPerTick: 5,
    /** 봇이 매매에 쓸 지갑 골드(예산 상한과 별개로 결제 가능하게) */
    seedWalletGold: 200_000,
    /** 초기 인벤(판매 유동성): 여러 아이템 소량 */
    seedStacks: [
      { itemId: "item_lesser_mana_stone", quantity: 30 },
      { itemId: "item_mana_stone", quantity: 15 },
      { itemId: "item_greater_mana_stone", quantity: 5 },
    ],
  },
  chat: {
    maxBodyLength: 500,
    defaultFetchLimit: 80,
    maxFetchLimit: 200,
  },
} as const;

