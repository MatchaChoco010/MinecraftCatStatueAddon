import {
  BlockPistonState,
  Dimension,
  EntityInventoryComponent,
  ExplosionBeforeEvent,
  GameMode,
  ItemDurabilityComponent,
  ItemStack,
  ItemUseOnBeforeEvent,
  PistonActivateAfterEvent,
  Player,
  PlayerBreakBlockBeforeEvent,
  PlayerPlaceBlockAfterEvent,
  PlayerSpawnAfterEvent,
  system,
  Vector3,
  world,
} from "@minecraft/server";

// 石像の連結状態と光の状態を更新する
function updateStatueState(dimension: Dimension, pos: Vector3) {
  const block = dimension.getBlock(pos);
  if (!block) return;

  if (block.typeId === "matchachoco010_cs:cat_statue_stone_head") {
    // 下方向に連結した石像の胴体の状態を更新する
    // 頭が光っているか
    // 高さが合計3以上になっているか

    let bodyCount = 0;
    let isHeadTorched = block.permutation?.getState("matchachoco010_cs:torch") || false;
    let direction = block.permutation?.getState("minecraft:cardinal_direction") || "north";

    // 下方向に連結した石像の胴体の数を数える
    let bodyPos = { x: pos.x, y: pos.y - 1, z: pos.z };
    let bodyBlock = dimension.getBlock(bodyPos);
    while (
      bodyBlock &&
      bodyBlock.typeId === "matchachoco010_cs:cat_statue_stone_body" &&
      bodyBlock.permutation?.getState("minecraft:cardinal_direction") === direction
    ) {
      bodyCount++;
      bodyPos = { x: bodyPos.x, y: bodyPos.y - 1, z: bodyPos.z };
      bodyBlock = dimension.getBlock(bodyPos);
    }
    const isTallStack = bodyCount >= 2;

    // 石像の頭の状態を更新
    block.setPermutation(block.permutation?.withState("matchachoco010_cs:tall_stack", isTallStack));

    // 石像の胴体の状態を更新
    for (let i = 0; i < bodyCount; i++) {
      const bodyPos = { x: pos.x, y: pos.y - 1 - i, z: pos.z };
      const bodyBlock = dimension.getBlock(bodyPos);
      bodyBlock?.setPermutation(bodyBlock.permutation?.withState("matchachoco010_cs:torch", isHeadTorched));
      bodyBlock?.setPermutation(bodyBlock.permutation?.withState("matchachoco010_cs:tall_stack", isTallStack));
    }
  } else if (block.typeId === "matchachoco010_cs:cat_statue_stone_body") {
    // 上と下の連結した石像の胴体を確認する
    // 一番上が連結した石像の頭の場合、連結した石像の胴体の状態を更新する
    // 頭が光っているか
    // 高さが合計3以上になっているか

    let bodyCount = 1;
    let direction = block.permutation?.getState("minecraft:cardinal_direction") || "north";

    // 上方向に連結した石像の胴体の数を数える
    let upBodyPos = { x: pos.x, y: pos.y + 1, z: pos.z };
    let upBodyBlock = dimension.getBlock(upBodyPos);
    while (
      upBodyBlock &&
      upBodyBlock.typeId === "matchachoco010_cs:cat_statue_stone_body" &&
      upBodyBlock.permutation?.getState("minecraft:cardinal_direction") === direction
    ) {
      bodyCount++;
      upBodyPos = { x: upBodyPos.x, y: upBodyPos.y + 1, z: upBodyPos.z };
      upBodyBlock = dimension.getBlock(upBodyPos);
    }

    // 一番上に連結した石像の頭があるかを調べる
    const topPos = upBodyPos;
    const topBlock = dimension.getBlock(topPos);
    const isHeadStack =
      topBlock !== undefined &&
      topBlock.typeId === "matchachoco010_cs:cat_statue_stone_head" &&
      topBlock.permutation?.getState("minecraft:cardinal_direction") === direction;

    // 下方向に連結した石像の胴体の数を数える
    let downBodyPos = { x: pos.x, y: pos.y - 1, z: pos.z };
    let downBodyBlock = dimension.getBlock(downBodyPos);
    while (
      downBodyBlock &&
      downBodyBlock.typeId === "matchachoco010_cs:cat_statue_stone_body" &&
      downBodyBlock.permutation?.getState("minecraft:cardinal_direction") === direction
    ) {
      bodyCount++;
      downBodyPos = { x: downBodyPos.x, y: downBodyPos.y - 1, z: downBodyPos.z };
      downBodyBlock = dimension.getBlock(downBodyPos);
    }

    // 石像の状態を決める
    const isHeadTorched = isHeadStack ? topBlock?.permutation?.getState("matchachoco010_cs:torch") || false : false;
    const isTallStack = bodyCount >= 2;

    // 石像の頭の状態を更新
    isHeadStack &&
      topBlock?.setPermutation(topBlock.permutation?.withState("matchachoco010_cs:tall_stack", isTallStack));

    // 石像の胴体の状態を更新
    for (let i = 0; i < bodyCount; i++) {
      const bodyPos = { x: topPos.x, y: topPos.y - 1 - i, z: topPos.z };
      const bodyBlock = dimension.getBlock(bodyPos);
      bodyBlock?.setPermutation(bodyBlock.permutation?.withState("matchachoco010_cs:torch", isHeadTorched));
      bodyBlock?.setPermutation(bodyBlock.permutation?.withState("matchachoco010_cs:tall_stack", isTallStack));
    }
  }
}

// 石像の頭に松明を使用したときの処理
function onUseTorchOnCatStatueStoneHead(event: ItemUseOnBeforeEvent) {
  const player = event.source as Player;
  const block = event.block;
  const item = event.itemStack;

  // プレイヤーが松明を持っている場合のみ処理
  if (!player || !block || !item || item.typeId !== "minecraft:torch") {
    return;
  }

  // 対象が石像の頭でない場合は処理しない
  if (block.typeId !== "matchachoco010_cs:cat_statue_stone_head") return;

  // torchの状態を取得
  const blockPermutation = block.permutation;
  if (!blockPermutation) return;
  const blockStateValue = blockPermutation.getState("matchachoco010_cs:torch");

  const inventory = player.getComponent("minecraft:inventory") as EntityInventoryComponent;
  if (!inventory) return;

  const container = inventory.container;
  if (!container) return;

  // イベントをキャンセルして標準の松明設置を防止
  event.cancel = true;

  if (blockStateValue === false) {
    // 松明を設置
    system.runTimeout(() => {
      block.setPermutation(blockPermutation.withState("matchachoco010_cs:torch", true));
      updateStatueState(block.dimension, block.location);

      // クリエイティブモード以外では松明を消費
      if (player.getGameMode() !== GameMode.creative) {
        const selectedSlot = player.selectedSlotIndex;

        // 選択中のスロットのアイテムを取得
        const slotItem = container.getItem(selectedSlot);
        if (!slotItem || slotItem.typeId !== "minecraft:torch") return;

        // 松明の数を減らす
        if (slotItem.amount > 1) {
          slotItem.amount--;
          container.setItem(selectedSlot, slotItem);
        } else {
          container.setItem(selectedSlot, undefined);
        }
      }
    }, 0);
  } else {
    // 松明を回収
    system.runTimeout(() => {
      block.setPermutation(blockPermutation.withState("matchachoco010_cs:torch", false));
      updateStatueState(block.dimension, block.location);

      // クリエイティブモード以外では松明を追加
      if (player.getGameMode() !== GameMode.creative) {
        const torchItem = new ItemStack("minecraft:torch", 1);

        // インベントリに追加を試み、失敗したらドロップ
        try {
          container.addItem(torchItem);
        } catch {
          const dropLocation = player.location;
          dropLocation.y += 0.5;
          player.dimension.spawnItem(torchItem, dropLocation);
        }
      }
    }, 0);
  }
}

// 彫刻刀で石を削ったときの処理
function onUseChiselStone(event: ItemUseOnBeforeEvent) {
  const player = event.source as Player;
  const block = event.block;
  const item = event.itemStack;

  // プレイヤーが彫刻刀を持っている場合のみ処理
  if (!player || !block || !item || item.typeId !== "matchachoco010_cs:cat_statue_chisel") {
    return;
  }

  // 対象が石もしくは深層岩でない場合は処理しない
  if (block.typeId !== "minecraft:stone" && block.typeId !== "minecraft:deepslate") return;

  // 石を掘った音を鳴らす
  system.run(() => {
    block.dimension.runCommand(
      `playsound block.grindstone.use @a ${block.location.x} ${block.location.y + 0.5} ${block.location.z} 5.0 1.0 0.0`
    );
  });

  // 道具の耐久度を減らす
  if (player.getGameMode() !== GameMode.creative) {
    system.run(() => {
      const durability = item.getComponent("minecraft:durability") as ItemDurabilityComponent;
      if (!durability) return;

      const inventory = player.getComponent("minecraft:inventory") as EntityInventoryComponent;
      if (!inventory) return;

      if (durability.damage < durability.getDamageChanceRange().max) {
        durability.damage += Math.floor(Math.random() * 3) + 1;
        inventory.container?.setItem(player.selectedSlotIndex, item);
      } else {
        inventory.container?.setItem(player.selectedSlotIndex, undefined);
        system.run(() => {
          player.dimension.runCommand(
            `playsound random.break @a ${player.location.x} ${player.location.y} ${player.location.z} 0.8 1.0 1.0`
          );
        });
      }
    });
  }

  // 上のブロックが石像の胴体もしくは頭だったらブロックで胴体を延長する
  const upPos = { x: block.location.x, y: block.location.y + 1, z: block.location.z };
  const upBlock = block.dimension.getBlock(upPos);
  if (
    upBlock?.typeId === "matchachoco010_cs:cat_statue_stone_body" ||
    upBlock?.typeId === "matchachoco010_cs:cat_statue_stone_head"
  ) {
    const direction = upBlock.permutation?.getState("minecraft:cardinal_direction") || "north";
    system.run(() => {
      block.dimension.setBlockType(block.location, "matchachoco010_cs:cat_statue_stone_body");
      block.setPermutation(block.permutation?.withState("minecraft:cardinal_direction", direction));
      updateStatueState(block.dimension, block.location);
    });
    return;
  }

  // 下のブロックが石像の胴体だったらブロックを頭にする
  const downPos = { x: block.location.x, y: block.location.y - 1, z: block.location.z };
  const downBlock = block.dimension.getBlock(downPos);
  if (downBlock?.typeId === "matchachoco010_cs:cat_statue_stone_body") {
    const direction = downBlock.permutation?.getState("minecraft:cardinal_direction") || "north";
    system.run(() => {
      block.dimension.setBlockType(block.location, "matchachoco010_cs:cat_statue_stone_head");
      block.setPermutation(block.permutation?.withState("minecraft:cardinal_direction", direction));
      updateStatueState(block.dimension, block.location);
    });
    return;
  }

  // 対象の石を見ている方向を向いた石像の頭にする
  let direction: string;
  if (player.getRotation().y >= -45 && player.getRotation().y < 45) {
    direction = "south";
  } else if (player.getRotation().y >= 45 && player.getRotation().y < 135) {
    direction = "west";
  } else if (player.getRotation().y >= 135 || player.getRotation().y < -135) {
    direction = "north";
  } else if (player.getRotation().y >= -135 && player.getRotation().y < -45) {
    direction = "east";
  } else {
    direction = "north";
  }
  system.run(() => {
    block.dimension.setBlockType(block.location, "matchachoco010_cs:cat_statue_stone_head");
    block.setPermutation(block.permutation?.withState("minecraft:cardinal_direction", direction));

    // 下のブロックを2つ確認して、石もしくは深層岩だったら胴体にする
    const downPos1 = { x: block.location.x, y: block.location.y - 1, z: block.location.z };
    const downBlock1 = block.dimension.getBlock(downPos1);
    if (downBlock1?.typeId === "minecraft:stone" || downBlock1?.typeId === "minecraft:deepslate") {
      block.dimension.setBlockType(downPos1, "matchachoco010_cs:cat_statue_stone_body");
      block.dimension
        .getBlock(downPos1)
        ?.setPermutation(downBlock1.permutation?.withState("minecraft:cardinal_direction", direction));

      const downPos2 = { x: downPos1.x, y: downPos1.y - 1, z: downPos1.z };
      const downBlock2 = block.dimension.getBlock(downPos2);
      if (downBlock2?.typeId === "minecraft:stone" || downBlock2?.typeId === "minecraft:deepslate") {
        block.dimension.setBlockType(downPos2, "matchachoco010_cs:cat_statue_stone_body");
        block.dimension
          .getBlock(downPos2)
          ?.setPermutation(downBlock2.permutation?.withState("minecraft:cardinal_direction", direction));
      }
    }

    updateStatueState(block.dimension, block.location);
  });
}

// 石像ブロックを壊したときの処理
function onPlayerBreakCatStatueStone(event: PlayerBreakBlockBeforeEvent) {
  const player = event.player;
  const block = event.block;

  if (!player || !block) return;

  if (block.typeId === "matchachoco010_cs:cat_statue_stone_head") {
    // 石像の頭を壊したときは、下方向に連結した石像の状態を更新する
    const downPos = { x: block.location.x, y: block.location.y - 1, z: block.location.z };

    const isHeadTorched = block.permutation?.getState("matchachoco010_cs:torch") ?? false;

    system.run(() => {
      updateStatueState(block.dimension, downPos);

      // 光っていたら松明をドロップ
      if (isHeadTorched) {
        const dropLocation = block.location;
        dropLocation.y += 0.5;
        block.dimension.spawnItem(new ItemStack("minecraft:torch", 1), dropLocation);
      }
    });
  } else if (block.typeId === "matchachoco010_cs:cat_statue_stone_body") {
    // 石像の胴体を壊したときは、上下方向に連結した石像の状態を更新する
    const upPos = { x: block.location.x, y: block.location.y + 1, z: block.location.z };
    const downPos = { x: block.location.x, y: block.location.y - 1, z: block.location.z };
    system.run(() => {
      updateStatueState(block.dimension, upPos);
      updateStatueState(block.dimension, downPos);
    });
  }
}

// 石像ブロックが爆発で壊れたときの処理
function onBlockExplodeCatStatueStone(event: ExplosionBeforeEvent) {
  const blocks = event.getImpactedBlocks();

  for (const block of blocks) {
    if (block.typeId === "matchachoco010_cs:cat_statue_stone_head") {
      // 石像の頭が壊れたときは、下方向に連結した石像の状態を更新する
      const downPos = { x: block.location.x, y: block.location.y - 1, z: block.location.z };
      system.run(() => {
        updateStatueState(block.dimension, downPos);
      });
    } else if (block.typeId === "matchachoco010_cs:cat_statue_stone_body") {
      // 石像の胴体が壊れたときは、上下方向に連結した石像の状態を更新する
      const upPos = { x: block.location.x, y: block.location.y + 1, z: block.location.z };
      const downPos = { x: block.location.x, y: block.location.y - 1, z: block.location.z };
      system.run(() => {
        updateStatueState(block.dimension, upPos);
        updateStatueState(block.dimension, downPos);
      });
    }
  }
}

// 石像ブロックをピストンで押したときの処理
function onPistonActivateCatStatueStone(event: PistonActivateAfterEvent) {
  const piston = event.piston;
  const isMoving = piston.isMoving;
  const pistonDirection = piston.block.permutation?.getState("facing_direction") as number;

  if (!isMoving || !pistonDirection) return;

  const directionOffsets = [
    { x: 0, y: -1, z: 0 },
    { x: 0, y: 1, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
  ];

  const offset = directionOffsets?.[pistonDirection];
  if (!offset) return;

  const pistonPos = piston.block.location;

  const affectedBlockPositions: Vector3[] = [];
  if (piston.state === BlockPistonState.Expanding) {
    // ピストンが押せるブロックの数12で動く可能性があるのは、
    // その動く前の位置と動いたあとの位置で13ブロック分。
    // そのため、1 + 12で13ブロック分を取得する。
    // オフセットは1から始めてピストンの隣のマスから確認する。
    for (let i = 1; i < 1 + 13; i++) {
      const pos = {
        x: pistonPos.x + offset.x * i,
        y: pistonPos.y + offset.y * i,
        z: pistonPos.z + offset.z * i,
      };
      const block = piston.block.dimension.getBlock(pos);
      if (!block) break;
      affectedBlockPositions.push(block.location);
    }
  } else if (piston.state === BlockPistonState.Retracting) {
    // ピストンが引いたときに動く可能性があるのは、
    // 粘着ピストンの隣の1マスのみ。
    // それによって変化するのは動く前の位置と動いたあとの位置の2ブロック分。
    for (let i = 1; i <= 2; i++) {
      const pos = {
        x: pistonPos.x + offset.x * i,
        y: pistonPos.y + offset.y * i,
        z: pistonPos.z + offset.z * i,
      };
      const block = piston.block.dimension.getBlock(pos);
      if (!block) break;
      affectedBlockPositions.push(block.location);
    }
  }

  // ピストンが動かしたブロックとその上下のブロックの状態を更新する。
  // 動かしたフレームとその直後のフレームはブロックのtypeIdが
  // minecraft:moving_blockになって石像ブロックかどうかの判定ができないので、
  // 2フレーム後に更新する。
  system.runTimeout(() => {
    affectedBlockPositions.forEach((blockPos) => {
      const block = piston.block.dimension.getBlock(blockPos);
      if (!block) return;

      const upPos = { x: block.location.x, y: block.location.y + 1, z: block.location.z };
      const downPos = { x: block.location.x, y: block.location.y - 1, z: block.location.z };
      updateStatueState(block.dimension, block.location);
      updateStatueState(block.dimension, upPos);
      updateStatueState(block.dimension, downPos);
    });
  }, 2);
}

// プレイヤーが石像ブロックを設置したときの処理
function onPlayerPlaceCatStatueStone(event: PlayerPlaceBlockAfterEvent) {
  const block = event.block;
  if (!block) return;

  if (
    block.typeId === "matchachoco010_cs:cat_statue_stone_head" ||
    block.typeId === "matchachoco010_cs:cat_statue_stone_body"
  ) {
    updateStatueState(block.dimension, block.location);
  }
}

// スニークしているプレイヤーの周囲のブロックを探索し、
// tall_stackがtrueの石像ブロックを見つけたら、
// そのプレイヤーに猫の石像トークンを付与する。
function giveCatStatueTokenToSneakingPlayer() {
  const players = world.getPlayers();
  players.forEach((player) => {
    if (player.isSneaking) {
      const inventory = player.getComponent("minecraft:inventory") as EntityInventoryComponent;
      if (!inventory) return;
      const playerPos = player.location;
      const searchRange = 4;
      const searchHeight = 2;
      for (let x = -searchRange; x <= searchRange; x++) {
        for (let z = -searchRange; z <= searchRange; z++) {
          for (let y = -searchHeight; y <= searchHeight; y++) {
            const pos = { x: playerPos.x + x, y: playerPos.y + y, z: playerPos.z + z };
            const block = player.dimension.getBlock(pos);
            if (!block) continue;
            if (
              (block.typeId === "matchachoco010_cs:cat_statue_stone_head" ||
                block.typeId === "matchachoco010_cs:cat_statue_stone_body") &&
              block.permutation?.getState("matchachoco010_cs:tall_stack")
            ) {
              inventory.container?.addItem(new ItemStack("matchachoco010_cs:cat_statue_token", 1));
              player.playSound("random.pop", { volume: 0.2 });
            }
          }
        }
      }
    }
  });

  // ランダムに20~40ティックで再度実行する
  system.runTimeout(giveCatStatueTokenToSneakingPlayer, Math.floor(Math.random() * 20) + 20);
}

// 初回プレイヤースポーン時に近くにstructureをロードする
function loadStructureFirstTime(event: PlayerSpawnAfterEvent) {
  const player = event.player;

  if (!world.getDynamicProperty("matchachoco010_cs:isFirstPlayerSpawned")) {
    world.setDynamicProperty("matchachoco010_cs:isFirstPlayerSpawned", true);
    const spawnLocation = player.location;
    player.dimension.runCommandAsync(
      `structure load matchachoco010_cs:cat_statue_spawn_point ${spawnLocation.x} ${spawnLocation.y} ${spawnLocation.z}`
    );
  }
}

// イベントを購読
world.beforeEvents.itemUseOn.subscribe((event: ItemUseOnBeforeEvent) => {
  onUseTorchOnCatStatueStoneHead(event);
  onUseChiselStone(event);
});
world.beforeEvents.playerBreakBlock.subscribe(onPlayerBreakCatStatueStone);
world.beforeEvents.explosion.subscribe(onBlockExplodeCatStatueStone);
world.afterEvents.pistonActivate.subscribe(onPistonActivateCatStatueStone);
world.afterEvents.playerPlaceBlock.subscribe(onPlayerPlaceCatStatueStone);
world.afterEvents.playerSpawn.subscribe(loadStructureFirstTime);

system.runTimeout(giveCatStatueTokenToSneakingPlayer, 100);
