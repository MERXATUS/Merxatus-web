export const GAME_RULES = {
  /** 내 부지(마을)에 설치 가능한 시설 칸 수 */
  plot: {
    maxSlots: 3,
    /**
     * 추가 부지 칸 해제 비용 (첫 칸=슬롯0 무료).
     * 인덱스 = 해제 후 사용 가능해지는 마지막 슬롯 인덱스에 해당하는 칸을 여는 비용이 아니라,
     * `unlockGoldAfterSlotCount[n]` = 현재 n칸까지 열려 있을 때 다음 칸을 열 때 필요한 골드.
     */
    unlockGoldAfterSlotCount: [1000, 10_000] as const,
  },
  workshop: {
    tickSeconds: 60,
    /** 수집(GATHER) 시설: 미수령으로 쌓이는 경과 시간 상한(밀리초). 초과 구간은 틱·드랍에 반영하지 않음 */
    maxBankedRealTimeMs: 8 * 60 * 60 * 1000,
    // 느리게 성장: 유지비를 올려 골드 싱크 강화
    upkeepGoldPerTickPerMinion: 3,
    /**
     * 시설 티어(1~5) 골드 업그레이드 비용: tier N -> N+1
     * 수집(GATHER)·가공(PROCESS) 공통
     */
    tierUpgradeGoldByFromTier: {
      1: 6000,
      2: 20000,
      3: 65000,
      4: 200000,
    } as const,
    /**
     * 가공(PROCESS) 시설: 현재 티어 기준 추가 제작 속도 배수 (직업·시너지 `craftSpeedMult`에 곱해짐)
     * 예: 1.08이면 기본 제작 시간이 약 7.4% 단축
     */
    processTierCraftSpeedMultByFromTier: {
      1: 1,
      2: 1.04,
      3: 1.08,
      4: 1.12,
      5: 1.16,
    } as const,
    // 도구(시설·인스턴스별 장착)로 희귀 드랍 가중치 보정
    tool: {
      /** 도구 장착 시, 희귀 드랍(minTier>=2) 가중치 배수 */
      rareWeightMultiplier: 1.5,
      /** 시설(WorkshopType) 이름별 허용 도구 itemId (WorkshopType.id는 cuid라 name이 더 안정적) */
      allowedToolItemIdsByWorkshopName: {
        광산: ["item_pickaxe", "item_pickaxe_t1", "item_pickaxe_t2", "item_pickaxe_t3", "item_pickaxe_t4", "item_pickaxe_t5", "item_pickaxe_goblin"],
        낚시터: ["item_fishing_rod", "item_rod_t1", "item_rod_t2", "item_rod_t3", "item_rod_t4", "item_rod_t5"],
        산: ["item_sickle_t1", "item_sickle_t2", "item_sickle_t3", "item_sickle_t4", "item_sickle_t5", "item_sickle_harvest"],
      } as const,
    },
  },
  combat: {
    /** 무기 전투력(미니언 개별 장착) */
    weaponPowerByItemId: {
      item_sword: 5,
      item_wood_sword: 4,
      item_iron_sword: 7,
      item_mithril_sword: 11,
      item_titanium_sword: 16,
      item_ether_sword: 23,

      item_wood_bow: 4,
      item_steel_bow: 7,
      item_mithril_bow: 11,
      item_titanium_bow: 16,
      item_ether_bow: 23,

      item_wood_staff: 4,
      item_magic_staff: 7,
      item_mithril_staff: 11,
      item_titanium_staff: 16,
      item_ether_staff: 23,
    } as const,
    /** 장착 무기 강화 1단계당 추가 전투력(베이스 무기 파워에 가산) */
    weaponLevelPowerPerLevel: 1,
    /** 미니언 기본 전투력(아직 레벨/스탯이 없어서 고정값으로 시작) */
    baseMinionPower: 5,
    /** 승률 하한/상한 */
    winRateClamp: { min: 0.05, max: 0.95 },
    /** 미니언 레벨 1 증가당 전투력 보너스 */
    levelPowerPerLevel: 1,
    /** 전투 특성 랭크 1당 전투력 보너스 */
    fighterTraitPowerPerRank: 3,
  },
  /** 미니언 획득(부화) 시 등급 가중치 · 던전 전투력 보정 */
  minion: {
    maxLevel: 100,
    /** 동시 보유 가능 미니언 수 상한 */
    maxOwned: 10,
    /** 부활/동기화 시 S~D 롤(합이 꼭 100일 필요 없음) */
    gradeBirthWeights: { S: 2, A: 8, B: 18, C: 32, D: 40 } as const,
    /** 던전 파티 전투력에 합산 (등급별) */
    gradeCombatPower: { S: 14, A: 10, B: 6, C: 3, D: 0 } as const,
  },
  /**
   * 마을 시설별 “특화 직업” 미니언 보너스 · 시너지(3/5/7/10명).
   * 어떤 직업이든 배치 가능하며, 특화 직업만 매칭되어 가산된다.
   */
  workshopLabor: {
    /** 특화 직업 일치 미니언 1명당 가산 가동력(드랍 롤·제작 등) */
    matchingBonusPerMinion: 0.18,
    /** 특화 직업 인원 기준 누적 시너지 배수(곱) */
    synergyMultAt3: 1.06,
    synergyMultAt5: 1.08,
    synergyMultAt7: 1.1,
    synergyMultAt10: 1.12,
    /** 제작 속도·산출 배수 상한 (과도한 단축 방지) */
    craftSpeedMultMax: 2.2,
    craftSpeedMultMin: 0.85,
  },
  minionUpgrade: {
    // 강화 비용(골드+재료): nextLevel = currentLevel + 1
    gold: { base: 500, growth: 1.35 },
    // 재료 요구치(레벨 기반) - MVP용 단순 룰
    materials: {
      stonePerNextLevel: 1,
      oreEveryNLevels: 2,
      oreQty: 1,
    },
  },
  /** 장착 무기 강화(미니언 단위, weaponLevel 0부터 시작) */
  weaponUpgrade: {
    maxLevel: 15,
    gold: { base: 150, growth: 1.28 },
    materials: {
      stonePerNextLevel: 2,
      oreEveryNLevels: 3,
      oreQty: 1,
    },
  },
  market: {
    feeBps: 1000, // 10%
  },
  reputation: {
    /** 명예가 이 이상이면 암시장 이용 불가 */
    honorBlocksBlackMarketAt: 50_000,
    /** 악명이 이 이상이면 황실 이용 불가 */
    infamyBlocksRoyalAt: 20_000,
  },
  auction: {
    baseDurationSeconds: 10 * 60,
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
      { itemId: "item_ore", quantity: 25 },
      { itemId: "item_bread", quantity: 10 },
      { itemId: "item_herb", quantity: 10 },
    ],
  },
  chat: {
    maxBodyLength: 500,
    defaultFetchLimit: 80,
    maxFetchLimit: 200,
  },
} as const;

