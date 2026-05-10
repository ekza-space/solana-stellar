/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/solana_stellar.json`.
 */
export type SolanaStellar = {
  address: "3rVXfq7LLSLqbDzvZuSrQoMytwczLj2Q8Hue62rxPZAA";
  metadata: {
    name: "solanaStellar";
    version: "0.1.0";
    spec: "0.1.0";
    description: "Created with Anchor";
  };
  instructions: [
    {
      name: "addAssetParent";
      discriminator: [104, 56, 24, 76, 97, 101, 94, 143];
      accounts: [
        {
          name: "childAsset";
          writable: true;
        },
        {
          name: "parentAsset";
        },
        {
          name: "creator";
          writable: true;
          signer: true;
          relations: ["childAsset"];
        },
        {
          name: "assetParent";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [108, 105, 110, 107];
              },
              {
                kind: "account";
                path: "childAsset";
              },
              {
                kind: "account";
                path: "parentAsset";
              }
            ];
          };
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [];
    },
    {
      name: "addReleaseShare";
      discriminator: [130, 134, 41, 170, 213, 143, 97, 137];
      accounts: [
        {
          name: "universe";
        },
        {
          name: "release";
          writable: true;
        },
        {
          name: "share";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [115, 104, 97, 114, 101];
              },
              {
                kind: "account";
                path: "release";
              },
              {
                kind: "account";
                path: "contributor";
              }
            ];
          };
        },
        {
          name: "contributor";
        },
        {
          name: "owner";
          writable: true;
          signer: true;
          relations: ["universe"];
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "bps";
          type: "u16";
        }
      ];
    },
    {
      name: "approveAsset";
      discriminator: [127, 15, 21, 247, 23, 22, 189, 238];
      accounts: [
        {
          name: "universe";
        },
        {
          name: "asset";
          writable: true;
        },
        {
          name: "owner";
          signer: true;
          relations: ["universe"];
        }
      ];
      args: [];
    },
    {
      name: "claimRevenue";
      discriminator: [4, 22, 151, 70, 183, 79, 73, 189];
      accounts: [
        {
          name: "release";
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  114,
                  101,
                  108,
                  101,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ];
              },
              {
                kind: "account";
                path: "release";
              }
            ];
          };
        },
        {
          name: "share";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [115, 104, 97, 114, 101];
              },
              {
                kind: "account";
                path: "release";
              },
              {
                kind: "account";
                path: "contributor";
              }
            ];
          };
        },
        {
          name: "contributor";
          writable: true;
          signer: true;
        }
      ];
      args: [];
    },
    {
      name: "closeAsset";
      discriminator: [39, 124, 90, 146, 16, 82, 77, 253];
      accounts: [
        {
          name: "universe";
        },
        {
          name: "asset";
          writable: true;
        },
        {
          name: "authority";
          signer: true;
        },
        {
          name: "rentReceiver";
          writable: true;
        }
      ];
      args: [];
    },
    {
      name: "closeUniverse";
      discriminator: [44, 6, 172, 166, 141, 160, 154, 4];
      accounts: [
        {
          name: "universe";
          writable: true;
        },
        {
          name: "owner";
          writable: true;
          signer: true;
          relations: ["universe"];
        }
      ];
      args: [];
    },
    {
      name: "createAsset";
      discriminator: [28, 42, 120, 51, 7, 38, 156, 136];
      accounts: [
        {
          name: "universe";
          writable: true;
        },
        {
          name: "asset";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [97, 115, 115, 101, 116];
              },
              {
                kind: "account";
                path: "universe";
              },
              {
                kind: "arg";
                path: "assetIndex";
              }
            ];
          };
        },
        {
          name: "creator";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "assetIndex";
          type: "u64";
        },
        {
          name: "kind";
          type: {
            defined: {
              name: "assetKind";
            };
          };
        },
        {
          name: "subtype";
          type: {
            defined: {
              name: "assetSubtype";
            };
          };
        },
        {
          name: "licenseKind";
          type: {
            defined: {
              name: "licenseKind";
            };
          };
        },
        {
          name: "metadataHash";
          type: "string";
        },
        {
          name: "previewHash";
          type: "string";
        }
      ];
    },
    {
      name: "createRelease";
      discriminator: [76, 2, 12, 43, 107, 154, 171, 200];
      accounts: [
        {
          name: "universe";
          writable: true;
        },
        {
          name: "asset";
        },
        {
          name: "release";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 108, 101, 97, 115, 101];
              },
              {
                kind: "account";
                path: "universe";
              },
              {
                kind: "arg";
                path: "releaseIndex";
              }
            ];
          };
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  114,
                  101,
                  108,
                  101,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ];
              },
              {
                kind: "account";
                path: "release";
              }
            ];
          };
        },
        {
          name: "owner";
          writable: true;
          signer: true;
          relations: ["universe"];
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "releaseIndex";
          type: "u64";
        },
        {
          name: "metadataHash";
          type: "string";
        }
      ];
    },
    {
      name: "createUniverse";
      discriminator: [68, 252, 105, 236, 109, 225, 120, 113];
      accounts: [
        {
          name: "registry";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [114, 101, 103, 105, 115, 116, 114, 121];
              }
            ];
          };
        },
        {
          name: "universe";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [117, 110, 105, 118, 101, 114, 115, 101];
              },
              {
                kind: "account";
                path: "owner";
              },
              {
                kind: "arg";
                path: "universeIndex";
              }
            ];
          };
        },
        {
          name: "universeLookup";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  117,
                  110,
                  105,
                  118,
                  101,
                  114,
                  115,
                  101,
                  95,
                  105,
                  110,
                  100,
                  101,
                  120
                ];
              },
              {
                kind: "account";
                path: "registry.universe_count";
                account: "registry";
              }
            ];
          };
        },
        {
          name: "owner";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "universeIndex";
          type: "u64";
        },
        {
          name: "metadataHash";
          type: "string";
        },
        {
          name: "projectType";
          type: {
            defined: {
              name: "assetKind";
            };
          };
        },
        {
          name: "collaborationPolicy";
          type: {
            defined: {
              name: "collaborationPolicy";
            };
          };
        },
        {
          name: "open";
          type: "bool";
        }
      ];
    },
    {
      name: "depositRevenue";
      discriminator: [224, 212, 82, 100, 60, 240, 220, 29];
      accounts: [
        {
          name: "release";
          writable: true;
        },
        {
          name: "vault";
          writable: true;
          pda: {
            seeds: [
              {
                kind: "const";
                value: [
                  114,
                  101,
                  108,
                  101,
                  97,
                  115,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ];
              },
              {
                kind: "account";
                path: "release";
              }
            ];
          };
        },
        {
          name: "payer";
          writable: true;
          signer: true;
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        }
      ];
    },
    {
      name: "finalizeLineageEqualRelease";
      discriminator: [62, 145, 16, 168, 240, 50, 4, 42];
      accounts: [
        {
          name: "universe";
        },
        {
          name: "release";
          writable: true;
        },
        {
          name: "asset";
          writable: true;
        },
        {
          name: "owner";
          writable: true;
          signer: true;
          relations: ["universe"];
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "assetCount";
          type: "u16";
        },
        {
          name: "linkCount";
          type: "u16";
        }
      ];
    },
    {
      name: "finalizeRelease";
      discriminator: [133, 95, 4, 17, 103, 213, 141, 58];
      accounts: [
        {
          name: "universe";
        },
        {
          name: "release";
          writable: true;
        },
        {
          name: "asset";
          writable: true;
        },
        {
          name: "owner";
          signer: true;
          relations: ["universe"];
        }
      ];
      args: [];
    },
    {
      name: "finalizeWeightedRelease";
      discriminator: [84, 228, 162, 41, 173, 60, 169, 68];
      accounts: [
        {
          name: "universe";
        },
        {
          name: "release";
          writable: true;
        },
        {
          name: "asset";
          writable: true;
        },
        {
          name: "owner";
          writable: true;
          signer: true;
          relations: ["universe"];
        },
        {
          name: "systemProgram";
          address: "11111111111111111111111111111111";
        }
      ];
      args: [
        {
          name: "assetCount";
          type: "u16";
        },
        {
          name: "linkCount";
          type: "u16";
        }
      ];
    },
    {
      name: "linkAvatarData";
      discriminator: [100, 18, 17, 99, 22, 120, 141, 252];
      accounts: [
        {
          name: "universe";
        },
        {
          name: "release";
          writable: true;
        },
        {
          name: "owner";
          signer: true;
          relations: ["universe"];
        }
      ];
      args: [
        {
          name: "avatarData";
          type: "pubkey";
        }
      ];
    },
    {
      name: "rejectAsset";
      discriminator: [79, 96, 89, 56, 10, 45, 227, 217];
      accounts: [
        {
          name: "universe";
        },
        {
          name: "asset";
          writable: true;
        },
        {
          name: "owner";
          signer: true;
          relations: ["universe"];
        }
      ];
      args: [];
    },
    {
      name: "submitAsset";
      discriminator: [4, 23, 13, 111, 93, 172, 183, 91];
      accounts: [
        {
          name: "asset";
          writable: true;
        },
        {
          name: "creator";
          signer: true;
          relations: ["asset"];
        }
      ];
      args: [];
    },
    {
      name: "updateAssetMetadata";
      discriminator: [217, 98, 205, 153, 242, 4, 41, 76];
      accounts: [
        {
          name: "asset";
          writable: true;
        },
        {
          name: "creator";
          signer: true;
          relations: ["asset"];
        }
      ];
      args: [
        {
          name: "licenseKind";
          type: {
            defined: {
              name: "licenseKind";
            };
          };
        },
        {
          name: "metadataHash";
          type: "string";
        },
        {
          name: "previewHash";
          type: "string";
        }
      ];
    },
    {
      name: "updateUniverse";
      discriminator: [157, 157, 54, 180, 142, 174, 246, 121];
      accounts: [
        {
          name: "universe";
          writable: true;
        },
        {
          name: "owner";
          signer: true;
          relations: ["universe"];
        }
      ];
      args: [
        {
          name: "metadataHash";
          type: "string";
        },
        {
          name: "open";
          type: "bool";
        },
        {
          name: "collaborationPolicy";
          type: {
            defined: {
              name: "collaborationPolicy";
            };
          };
        }
      ];
    }
  ];
  accounts: [
    {
      name: "asset";
      discriminator: [234, 180, 241, 252, 139, 224, 160, 8];
    },
    {
      name: "assetParent";
      discriminator: [247, 168, 159, 50, 150, 61, 235, 227];
    },
    {
      name: "contributorShare";
      discriminator: [146, 88, 198, 243, 240, 238, 221, 182];
    },
    {
      name: "registry";
      discriminator: [47, 174, 110, 246, 184, 182, 252, 218];
    },
    {
      name: "release";
      discriminator: [229, 49, 96, 148, 167, 188, 17, 49];
    },
    {
      name: "releaseVault";
      discriminator: [33, 38, 51, 77, 217, 179, 1, 5];
    },
    {
      name: "universe";
      discriminator: [86, 112, 227, 226, 88, 47, 242, 113];
    },
    {
      name: "universeIndex";
      discriminator: [160, 143, 49, 208, 138, 104, 75, 45];
    }
  ];
  events: [
    {
      name: "assetCreated";
      discriminator: [206, 193, 252, 254, 207, 185, 154, 4];
    },
    {
      name: "assetParentAdded";
      discriminator: [194, 97, 145, 92, 28, 207, 67, 68];
    },
    {
      name: "assetStatusChanged";
      discriminator: [50, 89, 231, 242, 218, 23, 131, 216];
    },
    {
      name: "avatarDataLinked";
      discriminator: [189, 148, 22, 111, 17, 129, 142, 202];
    },
    {
      name: "releaseCreated";
      discriminator: [86, 95, 64, 109, 171, 247, 137, 65];
    },
    {
      name: "releaseDistributionModelSet";
      discriminator: [211, 71, 130, 3, 8, 110, 114, 3];
    },
    {
      name: "releaseShareAdded";
      discriminator: [189, 43, 189, 229, 54, 190, 30, 239];
    },
    {
      name: "releaseStatusChanged";
      discriminator: [116, 240, 44, 172, 164, 80, 0, 127];
    },
    {
      name: "revenueClaimed";
      discriminator: [5, 254, 104, 87, 133, 137, 45, 116];
    },
    {
      name: "revenueDeposited";
      discriminator: [97, 189, 62, 159, 189, 208, 43, 181];
    },
    {
      name: "universeCreated";
      discriminator: [244, 82, 63, 148, 26, 10, 53, 67];
    },
    {
      name: "universeUpdated";
      discriminator: [111, 110, 186, 3, 147, 5, 33, 73];
    }
  ];
  errors: [
    {
      code: 6000;
      name: "unauthorized";
      msg: "Unauthorized action.";
    },
    {
      code: 6001;
      name: "universeClosed";
      msg: "Universe is closed to public collaboration.";
    },
    {
      code: 6002;
      name: "universeNotActive";
      msg: "Universe is not active.";
    },
    {
      code: 6003;
      name: "universeNotEmpty";
      msg: "Universe still has live assets or releases.";
    },
    {
      code: 6004;
      name: "invalidHash";
      msg: "Invalid metadata or content hash.";
    },
    {
      code: 6005;
      name: "invalidAssetIndex";
      msg: "Invalid asset index.";
    },
    {
      code: 6006;
      name: "invalidReleaseIndex";
      msg: "Invalid release index.";
    },
    {
      code: 6007;
      name: "assetLocked";
      msg: "Asset is locked for this operation.";
    },
    {
      code: 6008;
      name: "invalidAssetStatus";
      msg: "Invalid asset status for this operation.";
    },
    {
      code: 6009;
      name: "universeMismatch";
      msg: "Universe mismatch.";
    },
    {
      code: 6010;
      name: "assetMismatch";
      msg: "Asset mismatch.";
    },
    {
      code: 6011;
      name: "releaseMismatch";
      msg: "Release mismatch.";
    },
    {
      code: 6012;
      name: "invalidLineageLink";
      msg: "Invalid lineage link.";
    },
    {
      code: 6013;
      name: "invalidLineageProof";
      msg: "Invalid lineage proof.";
    },
    {
      code: 6014;
      name: "invalidContributorCount";
      msg: "Invalid contributor count.";
    },
    {
      code: 6015;
      name: "releaseLocked";
      msg: "Release is locked for this operation.";
    },
    {
      code: 6016;
      name: "releaseNotFinalized";
      msg: "Release is not finalized.";
    },
    {
      code: 6017;
      name: "invalidShareBps";
      msg: "Invalid contributor share basis points.";
    },
    {
      code: 6018;
      name: "invalidDistributionModel";
      msg: "Invalid release distribution model for this operation.";
    },
    {
      code: 6019;
      name: "immutableCollaborationPolicy";
      msg: "Collaboration policy is immutable after universe creation.";
    },
    {
      code: 6020;
      name: "invalidRevenueAmount";
      msg: "Invalid revenue amount.";
    },
    {
      code: 6021;
      name: "noRevenueToClaim";
      msg: "No revenue available to claim.";
    },
    {
      code: 6022;
      name: "insufficientVaultBalance";
      msg: "Release vault balance is insufficient.";
    },
    {
      code: 6023;
      name: "numericalOverflow";
      msg: "Numerical overflow occurred.";
    }
  ];
  types: [
    {
      name: "asset";
      type: {
        kind: "struct";
        fields: [
          {
            name: "universe";
            type: "pubkey";
          },
          {
            name: "index";
            type: "u64";
          },
          {
            name: "creator";
            type: "pubkey";
          },
          {
            name: "rentPayer";
            type: "pubkey";
          },
          {
            name: "bump";
            type: "u8";
          },
          {
            name: "kind";
            type: {
              defined: {
                name: "assetKind";
              };
            };
          },
          {
            name: "subtype";
            type: {
              defined: {
                name: "assetSubtype";
              };
            };
          },
          {
            name: "licenseKind";
            type: {
              defined: {
                name: "licenseKind";
              };
            };
          },
          {
            name: "status";
            type: {
              defined: {
                name: "assetStatus";
              };
            };
          },
          {
            name: "metadataHash";
            type: "string";
          },
          {
            name: "previewHash";
            type: "string";
          },
          {
            name: "createdAt";
            type: "i64";
          },
          {
            name: "updatedAt";
            type: "i64";
          },
          {
            name: "parentCount";
            type: "u16";
          }
        ];
      };
    },
    {
      name: "assetCreated";
      type: {
        kind: "struct";
        fields: [
          {
            name: "universe";
            type: "pubkey";
          },
          {
            name: "asset";
            type: "pubkey";
          },
          {
            name: "creator";
            type: "pubkey";
          },
          {
            name: "index";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "assetKind";
      type: {
        kind: "enum";
        variants: [
          {
            name: "image";
          },
          {
            name: "model3d";
          },
          {
            name: "animation";
          },
          {
            name: "audio";
          },
          {
            name: "script";
          },
          {
            name: "metadata";
          },
          {
            name: "other";
          }
        ];
      };
    },
    {
      name: "assetParent";
      type: {
        kind: "struct";
        fields: [
          {
            name: "childAsset";
            type: "pubkey";
          },
          {
            name: "parentAsset";
            type: "pubkey";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "assetParentAdded";
      type: {
        kind: "struct";
        fields: [
          {
            name: "childAsset";
            type: "pubkey";
          },
          {
            name: "parentAsset";
            type: "pubkey";
          }
        ];
      };
    },
    {
      name: "assetStatus";
      type: {
        kind: "enum";
        variants: [
          {
            name: "draft";
          },
          {
            name: "submitted";
          },
          {
            name: "approved";
          },
          {
            name: "rejected";
          },
          {
            name: "finalized";
          },
          {
            name: "minted";
          },
          {
            name: "archived";
          }
        ];
      };
    },
    {
      name: "assetStatusChanged";
      type: {
        kind: "struct";
        fields: [
          {
            name: "asset";
            type: "pubkey";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "assetStatus";
              };
            };
          }
        ];
      };
    },
    {
      name: "assetSubtype";
      type: {
        kind: "enum";
        variants: [
          {
            name: "concept";
          },
          {
            name: "sketch";
          },
          {
            name: "texture";
          },
          {
            name: "mesh";
          },
          {
            name: "rig";
          },
          {
            name: "motion";
          },
          {
            name: "preview";
          },
          {
            name: "final";
          },
          {
            name: "other";
          }
        ];
      };
    },
    {
      name: "avatarDataLinked";
      type: {
        kind: "struct";
        fields: [
          {
            name: "release";
            type: "pubkey";
          },
          {
            name: "avatarData";
            type: "pubkey";
          }
        ];
      };
    },
    {
      name: "collaborationPolicy";
      type: {
        kind: "enum";
        variants: [
          {
            name: "equal";
          },
          {
            name: "lineageEqual";
          },
          {
            name: "weighted";
          },
          {
            name: "custom";
          }
        ];
      };
    },
    {
      name: "contributorShare";
      type: {
        kind: "struct";
        fields: [
          {
            name: "release";
            type: "pubkey";
          },
          {
            name: "contributor";
            type: "pubkey";
          },
          {
            name: "bps";
            type: "u16";
          },
          {
            name: "claimedLamports";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "licenseKind";
      type: {
        kind: "enum";
        variants: [
          {
            name: "unknown";
          },
          {
            name: "allRightsReserved";
          },
          {
            name: "cc0";
          },
          {
            name: "ccBy4";
          },
          {
            name: "ccBySa4";
          },
          {
            name: "ccByNc4";
          },
          {
            name: "ccByNcSa4";
          },
          {
            name: "mit";
          },
          {
            name: "custom";
          }
        ];
      };
    },
    {
      name: "registry";
      type: {
        kind: "struct";
        fields: [
          {
            name: "universeCount";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "release";
      type: {
        kind: "struct";
        fields: [
          {
            name: "universe";
            type: "pubkey";
          },
          {
            name: "asset";
            type: "pubkey";
          },
          {
            name: "vault";
            type: "pubkey";
          },
          {
            name: "index";
            type: "u64";
          },
          {
            name: "authority";
            type: "pubkey";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "releaseStatus";
              };
            };
          },
          {
            name: "distributionModel";
            type: {
              defined: {
                name: "collaborationPolicy";
              };
            };
          },
          {
            name: "metadataHash";
            type: "string";
          },
          {
            name: "totalShareBps";
            type: "u16";
          },
          {
            name: "totalDepositedLamports";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
          {
            name: "createdAt";
            type: "i64";
          },
          {
            name: "finalizedAt";
            type: "i64";
          },
          {
            name: "linkedAvatarData";
            type: "pubkey";
          }
        ];
      };
    },
    {
      name: "releaseCreated";
      type: {
        kind: "struct";
        fields: [
          {
            name: "universe";
            type: "pubkey";
          },
          {
            name: "release";
            type: "pubkey";
          },
          {
            name: "asset";
            type: "pubkey";
          },
          {
            name: "vault";
            type: "pubkey";
          },
          {
            name: "index";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "releaseDistributionModelSet";
      type: {
        kind: "struct";
        fields: [
          {
            name: "release";
            type: "pubkey";
          },
          {
            name: "distributionModel";
            type: {
              defined: {
                name: "collaborationPolicy";
              };
            };
          },
          {
            name: "contributorCount";
            type: "u16";
          }
        ];
      };
    },
    {
      name: "releaseShareAdded";
      type: {
        kind: "struct";
        fields: [
          {
            name: "release";
            type: "pubkey";
          },
          {
            name: "contributor";
            type: "pubkey";
          },
          {
            name: "bps";
            type: "u16";
          }
        ];
      };
    },
    {
      name: "releaseStatus";
      type: {
        kind: "enum";
        variants: [
          {
            name: "draft";
          },
          {
            name: "finalized";
          },
          {
            name: "linked";
          },
          {
            name: "archived";
          }
        ];
      };
    },
    {
      name: "releaseStatusChanged";
      type: {
        kind: "struct";
        fields: [
          {
            name: "release";
            type: "pubkey";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "releaseStatus";
              };
            };
          }
        ];
      };
    },
    {
      name: "releaseVault";
      type: {
        kind: "struct";
        fields: [
          {
            name: "release";
            type: "pubkey";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "revenueClaimed";
      type: {
        kind: "struct";
        fields: [
          {
            name: "release";
            type: "pubkey";
          },
          {
            name: "contributor";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          },
          {
            name: "totalClaimed";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "revenueDeposited";
      type: {
        kind: "struct";
        fields: [
          {
            name: "release";
            type: "pubkey";
          },
          {
            name: "vault";
            type: "pubkey";
          },
          {
            name: "payer";
            type: "pubkey";
          },
          {
            name: "amount";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "universe";
      type: {
        kind: "struct";
        fields: [
          {
            name: "owner";
            type: "pubkey";
          },
          {
            name: "index";
            type: "u64";
          },
          {
            name: "globalIndex";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          },
          {
            name: "assetCount";
            type: "u64";
          },
          {
            name: "releaseCount";
            type: "u64";
          },
          {
            name: "open";
            type: "bool";
          },
          {
            name: "status";
            type: {
              defined: {
                name: "universeStatus";
              };
            };
          },
          {
            name: "projectType";
            type: {
              defined: {
                name: "assetKind";
              };
            };
          },
          {
            name: "collaborationPolicy";
            docs: [
              "Revenue distribution policy used for releases in this universe.",
              "It is immutable after universe creation so admins cannot alter the",
              "economic deal that contributors relied on when joining."
            ];
            type: {
              defined: {
                name: "collaborationPolicy";
              };
            };
          },
          {
            name: "metadataHash";
            type: "string";
          },
          {
            name: "createdAt";
            type: "i64";
          },
          {
            name: "updatedAt";
            type: "i64";
          }
        ];
      };
    },
    {
      name: "universeCreated";
      type: {
        kind: "struct";
        fields: [
          {
            name: "universe";
            type: "pubkey";
          },
          {
            name: "owner";
            type: "pubkey";
          },
          {
            name: "index";
            type: "u64";
          },
          {
            name: "globalIndex";
            type: "u64";
          }
        ];
      };
    },
    {
      name: "universeIndex";
      type: {
        kind: "struct";
        fields: [
          {
            name: "globalIndex";
            type: "u64";
          },
          {
            name: "universe";
            type: "pubkey";
          },
          {
            name: "owner";
            type: "pubkey";
          },
          {
            name: "ownerIndex";
            type: "u64";
          },
          {
            name: "bump";
            type: "u8";
          }
        ];
      };
    },
    {
      name: "universeStatus";
      type: {
        kind: "enum";
        variants: [
          {
            name: "active";
          },
          {
            name: "closed";
          }
        ];
      };
    },
    {
      name: "universeUpdated";
      type: {
        kind: "struct";
        fields: [
          {
            name: "universe";
            type: "pubkey";
          },
          {
            name: "open";
            type: "bool";
          }
        ];
      };
    }
  ];
};
