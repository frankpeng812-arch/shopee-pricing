/** 成本定价 — 站点渠道数据（bundled fallback，与 remote-config.json shipping.sites 同步） */
const COST_PRICING_SITE_DATA = {
  "AR": {
    "name": "阿根廷",
    "currency": "AR$",
    "currencyCode": "ARS",
    "css": "ar",
    "exchangeRate": 200,
    "commission": 0.12,
    "transaction": 0.03,
    "fssRate": 0.04,
    "ccbRate": 0.03,
    "cargoTypes": {
      "普货": {
        "Expreso estándar\n(标准渠道)": {
          "type": "air",
          "label": "标准渠道",
          "baseWeight": 30.0,
          "basePrice": 1426.0,
          "stepWeight": 10.0,
          "stepPrice": 377.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      }
    }
  },
  "BR": {
    "name": "巴西",
    "currency": "R$",
    "currencyCode": "BRL",
    "css": "br",
    "exchangeRate": 0.78,
    "commission": 0.14,
    "transaction": 0.03,
    "fssRate": 0.04,
    "ccbRate": 0.03,
    "cargoTypes": {
      "普货": {
        "Expresso padrão\n(标准渠道) [Zone A]": {
          "type": "air",
          "label": "标准渠道",
          "baseWeight": 30.0,
          "basePrice": 5.0,
          "stepWeight": 10.0,
          "stepPrice": 0.9,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 13.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      },
      "特货": {
        "Envio especial (特貨渠道) [Zone A]": {
          "type": "air",
          "label": "Envio especial",
          "baseWeight": 30.0,
          "basePrice": 5.0,
          "stepWeight": 10.0,
          "stepPrice": 0.9,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 20.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      }
    }
  },
  "MX": {
    "name": "墨西哥",
    "currency": "MX$",
    "currencyCode": "MXN",
    "css": "mx",
    "exchangeRate": 2.5,
    "commission": 0.12,
    "transaction": 0.03,
    "fssRate": 0.04,
    "ccbRate": 0.03,
    "cargoTypes": {
      "普货": {
        "Estandar Rapido\n(标准渠道)": {
          "type": "air",
          "label": "标准渠道",
          "baseWeight": 10.0,
          "basePrice": 21.2,
          "stepWeight": 10.0,
          "stepPrice": 2.8,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Estandar Rapido\n(标准渠道）HK)": {
          "type": "air",
          "label": "标准渠道）HK",
          "baseWeight": 30.0,
          "basePrice": 29.2,
          "stepWeight": 10.0,
          "stepPrice": 4.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      },
      "特货": {
        "Envio Estandar- Productos Especiales\n(特货渠道）HK)": {
          "type": "air",
          "label": "特货渠道）HK",
          "baseWeight": 30.0,
          "basePrice": 41.2,
          "stepWeight": 10.0,
          "stepPrice": 4.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      }
    }
  },
  "MY": {
    "name": "马来西亚",
    "currency": "RM",
    "currencyCode": "MYR",
    "css": "my",
    "exchangeRate": 0.64,
    "commission": 0.1836,
    "transaction": 0.0378,
    "fssRate": 0.04,
    "ccbRate": 0.03,
    "cargoTypes": {
      "普货": {
        "Standard Doorstep Delivery (International)\n(标准渠道) [Zone KV]": {
          "type": "air",
          "label": "标准渠道",
          "baseWeight": 10.0,
          "basePrice": 0.15,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 800.0,
          "buyerBasePrice": 4.9,
          "buyerStepWeight": 250.0,
          "buyerStepPrice": 2.2
        },
        "Express Delivery (International)\n(快速渠道) [Zone KV]": {
          "type": "air",
          "label": "快速渠道",
          "baseWeight": 10.0,
          "basePrice": 0.15,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 800.0,
          "buyerBasePrice": 4.9,
          "buyerStepWeight": 250.0,
          "buyerStepPrice": 2.2
        },
        "Self Collection (Shopee Xpress)\n(买家自提渠道) [Zone KV]": {
          "type": "pickup",
          "label": "买家自提渠道",
          "baseWeight": 10.0,
          "basePrice": 0.15,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 800.0,
          "buyerBasePrice": 2.5,
          "buyerStepWeight": 250.0,
          "buyerStepPrice": 2.2
        },
        "SPX Express Lockers (Overseas)\n(买家自提渠道) [Zone KV]": {
          "type": "pickup",
          "label": "买家自提渠道",
          "baseWeight": 10.0,
          "basePrice": 0.15,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 800.0,
          "buyerBasePrice": 2.5,
          "buyerStepWeight": 250.0,
          "buyerStepPrice": 2.2
        },
        "Doorstep Delivery (International Sea Shipping)\n(海运经济渠道) [Zone KV]": {
          "type": "sea",
          "label": "海运经济渠道",
          "baseWeight": 10.0,
          "basePrice": 0.15,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 1.5,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Doorstep Delivery (Brunei)\n(文莱渠道)": {
          "type": "air",
          "label": "文莱渠道",
          "baseWeight": 10.0,
          "basePrice": 0.15,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 800.0,
          "buyerBasePrice": 25.0,
          "buyerStepWeight": 250.0,
          "buyerStepPrice": 2.2
        }
      },
      "重货": {
        "Standard Doorstep Delivery (International)\n(标准渠道-重货) [Zone KV]": {
          "type": "air",
          "label": "标准渠道-重货",
          "baseWeight": 100.0,
          "basePrice": 2.1,
          "stepWeight": 100.0,
          "stepPrice": 1.1,
          "buyerBaseWeight": 800.0,
          "buyerBasePrice": 4.9,
          "buyerStepWeight": 250.0,
          "buyerStepPrice": 2.2
        },
        "Express Delivery (International)\n(快速渠道-重货) [Zone KV]": {
          "type": "air",
          "label": "快速渠道-重货",
          "baseWeight": 100.0,
          "basePrice": 2.1,
          "stepWeight": 100.0,
          "stepPrice": 1.1,
          "buyerBaseWeight": 800.0,
          "buyerBasePrice": 4.9,
          "buyerStepWeight": 250.0,
          "buyerStepPrice": 2.2
        },
        "Doorstep Delivery (International Sea Shipping)\n(海运大件渠道) [Zone KV]": {
          "type": "sea",
          "label": "海运大件渠道",
          "baseWeight": 1000.0,
          "basePrice": 7.5,
          "stepWeight": 1000.0,
          "stepPrice": 5.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      }
    }
  },
  "PH": {
    "name": "菲律宾",
    "currency": "₱",
    "currencyCode": "PHP",
    "css": "ph",
    "exchangeRate": 8.0,
    "commission": 0.12,
    "transaction": 0.0224,
    "fssRate": 0.04,
    "ccbRate": 0.03,
    "cargoTypes": {
      "普货": {
        "Standard International\n(标准渠道 - 内地) [Zone A]": {
          "type": "air",
          "label": "标准渠道 - 内地",
          "baseWeight": 50.0,
          "basePrice": 23.0,
          "stepWeight": 10.0,
          "stepPrice": 4.5,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 40.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Express International\n(快速渠道 - 内地) [Zone A]": {
          "type": "air",
          "label": "快速渠道 - 内地",
          "baseWeight": 50.0,
          "basePrice": 23.0,
          "stepWeight": 10.0,
          "stepPrice": 4.5,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 40.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Standard International\n(标准渠道 - 香港) [Zone A]": {
          "type": "air",
          "label": "标准渠道 - 香港",
          "baseWeight": 50.0,
          "basePrice": 23.0,
          "stepWeight": 10.0,
          "stepPrice": 5.5,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 38.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Economy International (Sea Shipping)\n(海运经济渠道) [Zone A]": {
          "type": "sea",
          "label": "海运经济渠道",
          "baseWeight": 50.0,
          "basePrice": 23.0,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 20.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      }
    }
  },
  "SG": {
    "name": "新加坡",
    "currency": "S$",
    "currencyCode": "SGD",
    "css": "sg",
    "exchangeRate": 0.19,
    "commission": 0.16,
    "transaction": 0.03,
    "fssRate": 0.04,
    "ccbRate": 0.03,
    "cargoTypes": {
      "普货": {
        "Standard Doorstep Delivery (International)\n(标准渠道)": {
          "type": "air",
          "label": "标准渠道",
          "baseWeight": 40.0,
          "basePrice": 1.26,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 1.87,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Collection Point (Overseas)\n(买家自取渠道)": {
          "type": "pickup",
          "label": "买家自取渠道",
          "baseWeight": 40.0,
          "basePrice": 1.26,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Pick Lockers (Overseas)\n(自提柜渠道)": {
          "type": "pickup",
          "label": "自提柜渠道",
          "baseWeight": 40.0,
          "basePrice": 1.26,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "SPX Express Lockers (Overseas)\n(SPX自提柜渠道)": {
          "type": "pickup",
          "label": "SPX自提柜渠道",
          "baseWeight": 40.0,
          "basePrice": 1.26,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Express Doorstep Delivery (International)\n(快速渠道)": {
          "type": "air",
          "label": "快速渠道",
          "baseWeight": 40.0,
          "basePrice": 1.26,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 1.87,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Doorstep Delivery (Sea Shipping)\n(海运渠道)": {
          "type": "sea",
          "label": "海运渠道",
          "baseWeight": 2000,
          "basePrice": 3.4,
          "stepWeight": 1000,
          "stepPrice": 0.4,
          "buyerBaseWeight": 0.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 0.0,
          "buyerStepPrice": 0.0
        }
      },
      "重货": {
        "Standard Delivery (International)\n(标准渠道-重货)": {
          "type": "air",
          "label": "标准渠道-重货",
          "baseWeight": 100.0,
          "basePrice": 2.34,
          "stepWeight": 100.0,
          "stepPrice": 0.6,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 1.87,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Express Delivery (International)\n(快速渠道-重货)": {
          "type": "air",
          "label": "快速渠道-重货",
          "baseWeight": 100.0,
          "basePrice": 2.34,
          "stepWeight": 100.0,
          "stepPrice": 0.6,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 1.87,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      }
    }
  },
  "TH": {
    "name": "泰国",
    "currency": "฿",
    "currencyCode": "THB",
    "css": "th",
    "exchangeRate": 5.0,
    "commission": 0.2247,
    "transaction": 0.0321,
    "fssRate": 0.04,
    "ccbRate": 0.03,
    "cargoTypes": {
      "普货": {
        "Standard International Delivery\n(标准渠道) [Zone A]": {
          "type": "air",
          "label": "标准渠道",
          "baseWeight": 10.0,
          "basePrice": 1.0,
          "stepWeight": 10.0,
          "stepPrice": 1.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 23.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Express International Delivery\n(特快渠道 - 香港) [Zone A]": {
          "type": "air",
          "label": "特快渠道 - 香港",
          "baseWeight": 500.0,
          "basePrice": 2.0,
          "stepWeight": 10.0,
          "stepPrice": 0.15,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 40.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Standard International Delivery\n(标准渠道-南宁仓)*) [Zone A]": {
          "type": "air",
          "label": "标准渠道-南宁仓)*",
          "baseWeight": 10.0,
          "basePrice": 0.9,
          "stepWeight": 10.0,
          "stepPrice": 0.9,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 22.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Express International Delivery\n(特快渠道 - 内地) [Zone A]": {
          "type": "air",
          "label": "特快渠道 - 内地",
          "baseWeight": 10.0,
          "basePrice": 1.0,
          "stepWeight": 10.0,
          "stepPrice": 1.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 40.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Fast International Delivery\n(快速渠道) [Zone A]": {
          "type": "air",
          "label": "快速渠道",
          "baseWeight": 10.0,
          "basePrice": 1.0,
          "stepWeight": 10.0,
          "stepPrice": 1.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 23.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Fast International Delivery\n(快速渠道-南宁仓)*) [Zone A]": {
          "type": "air",
          "label": "快速渠道-南宁仓)*",
          "baseWeight": 10.0,
          "basePrice": 0.9,
          "stepWeight": 10.0,
          "stepPrice": 0.9,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 22.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      },
      "重货": {
        "International Delivery Bulky\n(大件渠道) [Zone A]": {
          "type": "air",
          "label": "大件渠道",
          "baseWeight": 10.0,
          "basePrice": 0.0,
          "stepWeight": 10.0,
          "stepPrice": 0.0,
          "buyerBaseWeight": 500.0,
          "buyerBasePrice": 32.0,
          "buyerStepWeight": 500.0,
          "buyerStepPrice": 32.0
        }
      }
    }
  },
  "TW": {
    "name": "台湾",
    "currency": "NT$",
    "currencyCode": "TWD",
    "css": "tw",
    "exchangeRate": 4.5,
    "commission": 0.12,
    "transaction": 0.03,
    "fssRate": 0.04,
    "ccbRate": 0.03,
    "cargoTypes": {
      "普货": {
        "蝦皮海外 - 7-11": {
          "type": "pickup",
          "label": "蝦皮海外 - 7-11",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 60.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 萊爾富 （空運）": {
          "type": "pickup",
          "label": "蝦皮海外 - 萊爾富 （空運）",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 50.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 萊爾富 （海運）": {
          "type": "pickup",
          "label": "蝦皮海外 - 萊爾富 （海運）",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 0.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 0.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 全家": {
          "type": "pickup",
          "label": "蝦皮海外 - 全家",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 60.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 宅配（空運）": {
          "type": "air",
          "label": "蝦皮海外 - 宅配（空運）",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 70.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 宅配（海運）": {
          "type": "air",
          "label": "蝦皮海外 - 宅配（海運）",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 20.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 快速到貨（蝦皮店到店）": {
          "type": "pickup",
          "label": "蝦皮海外 - 快速到貨（蝦皮店到店）",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 60.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 蝦皮店到店": {
          "type": "pickup",
          "label": "蝦皮海外 - 蝦皮店到店",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 45.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - OK MART（海運）": {
          "type": "air",
          "label": "蝦皮海外 - OK MART（海運）",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 10.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 711 （海運）": {
          "type": "pickup",
          "label": "蝦皮海外 - 711 （海運）",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 20.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 蝦皮店到店 （海運）": {
          "type": "pickup",
          "label": "蝦皮海外 - 蝦皮店到店 （海運）",
          "baseWeight": 500.0,
          "basePrice": 25.0,
          "stepWeight": 500.0,
          "stepPrice": 60.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 15.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      },
      "特货": {
        "蝦皮海外 - 7-11": {
          "type": "pickup",
          "label": "蝦皮海外 - 7-11",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 60.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 萊爾富 （空運）": {
          "type": "pickup",
          "label": "蝦皮海外 - 萊爾富 （空運）",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 50.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 萊爾富 （海運）": {
          "type": "pickup",
          "label": "蝦皮海外 - 萊爾富 （海運）",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 0.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 0.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 全家": {
          "type": "pickup",
          "label": "蝦皮海外 - 全家",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 60.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 宅配 （空運）": {
          "type": "air",
          "label": "蝦皮海外 - 宅配 （空運）",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 70.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 宅配（海運）": {
          "type": "air",
          "label": "蝦皮海外 - 宅配（海運）",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 20.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 快速到貨（蝦皮店到店）": {
          "type": "pickup",
          "label": "蝦皮海外 - 快速到貨（蝦皮店到店）",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 60.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 蝦皮店到店": {
          "type": "pickup",
          "label": "蝦皮海外 - 蝦皮店到店",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 45.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - OK MART（海運）": {
          "type": "air",
          "label": "蝦皮海外 - OK MART（海運）",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 10.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 711 （海運）": {
          "type": "pickup",
          "label": "蝦皮海外 - 711 （海運）",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 20.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 蝦皮店到店 （海運）": {
          "type": "pickup",
          "label": "蝦皮海外 - 蝦皮店到店 （海運）",
          "baseWeight": 500.0,
          "basePrice": 45.0,
          "stepWeight": 500.0,
          "stepPrice": 70.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 15.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      },
      "重货": {
        "蝦皮海外 - 大件宅配（海運）": {
          "type": "air",
          "label": "蝦皮海外 - 大件宅配（海運）",
          "baseWeight": 10.0,
          "basePrice": 0.0,
          "stepWeight": 10.0,
          "stepPrice": 0.0,
          "buyerBaseWeight": 0.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 0.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 7-11": {
          "type": "pickup",
          "label": "蝦皮海外 - 7-11",
          "baseWeight": 10.0,
          "basePrice": 2.5,
          "stepWeight": 10.0,
          "stepPrice": 2.5,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 25.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 萊爾富 （空運）": {
          "type": "pickup",
          "label": "蝦皮海外 - 萊爾富 （空運）",
          "baseWeight": 10.0,
          "basePrice": 2.5,
          "stepWeight": 10.0,
          "stepPrice": 2.5,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 0.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 全家": {
          "type": "pickup",
          "label": "蝦皮海外 - 全家",
          "baseWeight": 10.0,
          "basePrice": 2.5,
          "stepWeight": 10.0,
          "stepPrice": 2.5,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 20.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "蝦皮海外 - 宅配": {
          "type": "air",
          "label": "蝦皮海外 - 宅配",
          "baseWeight": 10.0,
          "basePrice": 2.5,
          "stepWeight": 10.0,
          "stepPrice": 2.5,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 50.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      }
    }
  },
  "VN": {
    "name": "越南",
    "currency": "₫",
    "currencyCode": "VND",
    "css": "vn",
    "exchangeRate": 3500,
    "commission": 0.12,
    "transaction": 0.03,
    "fssRate": 0.04,
    "ccbRate": 0.03,
    "cargoTypes": {
      "普货": {
        "Standard International\n(标准渠道) [Zone A1]": {
          "type": "air",
          "label": "标准渠道",
          "baseWeight": 10.0,
          "basePrice": 900.0,
          "stepWeight": 10.0,
          "stepPrice": 900.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 15000.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Standard International\n(标准渠道-南宁仓）*) [Zone A1]": {
          "type": "air",
          "label": "标准渠道-南宁仓）*",
          "baseWeight": 10.0,
          "basePrice": 750.0,
          "stepWeight": 10.0,
          "stepPrice": 750.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 10000.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Standard International (HK)\n(标准渠道 - 香港) [Zone A1]": {
          "type": "air",
          "label": "标准渠道 - 香港",
          "baseWeight": 10.0,
          "basePrice": 3220.0,
          "stepWeight": 10.0,
          "stepPrice": 3220.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 10000.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Standard International\n(标准渠道 - 高价值) [Zone A1]": {
          "type": "air",
          "label": "标准渠道 - 高价值",
          "baseWeight": 10.0,
          "basePrice": 900.0,
          "stepWeight": 10.0,
          "stepPrice": 900.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 15000.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Express International\n(快速渠道) [Zone A1]": {
          "type": "air",
          "label": "快速渠道",
          "baseWeight": 10.0,
          "basePrice": 900.0,
          "stepWeight": 10.0,
          "stepPrice": 900.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 15000.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Express International-NN\n(快速渠道-南宁仓)*) [Zone A1]": {
          "type": "air",
          "label": "快速渠道-南宁仓)*",
          "baseWeight": 10.0,
          "basePrice": 750.0,
          "stepWeight": 10.0,
          "stepPrice": 750.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 10000.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        },
        "Locker-Standard International\n(自提柜）渠道) [Zone A1]": {
          "type": "pickup",
          "label": "自提柜）渠道",
          "baseWeight": 10.0,
          "basePrice": 900.0,
          "stepWeight": 10.0,
          "stepPrice": 900.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 15000.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      },
      "重货": {
        "Standard Express\n(标准渠道) [Zone A1]": {
          "type": "air",
          "label": "标准渠道",
          "baseWeight": 250.0,
          "basePrice": 22500.0,
          "stepWeight": 100.0,
          "stepPrice": 4500.0,
          "buyerBaseWeight": 10.0,
          "buyerBasePrice": 15000.0,
          "buyerStepWeight": 10.0,
          "buyerStepPrice": 0.0
        }
      }
    }
  }
};
