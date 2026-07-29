# NPC agents

`AgentController` replaces timer-based NPC behaviour with a configurable
utility system. A profile contains `goalWeights`, `cadence`, `risk`,
`engagementRange`, `rules` and `hooks`. Every agent exposes `state` with a
blackboard, current goal/target, credits and a bounded decision history.

Built-in profiles: `trader`, `patrol`, `geologist`, `courier`, `ranger` and
`pirate`. Goals include `trade`, `delivery`, `survey`, `mine`, `explore`,
`patrol`, `defend`, `hunt`, `raid` and `flee`.

## Текущее поведение профилей

NPC появляется в прыжке к случайной планете. После завершения прыжка агент
принимает следующее решение с интервалом `cadence`; до этого он не меняет
выбранную цель. Сначала проверяются пользовательские `rules`, затем из
`goalWeights` выбирается одна цель. Для обычных целей агент выбирает случайную
планету или спутник, отличный от текущего тела, и выполняет FSD-прыжок.

| Профиль | Интервал решения | Веса целей | Фактическое действие сейчас |
|---|---:|---|---|
| `trader` — торговец | 90–180 с | trade 9, delivery 6, flee 2, explore 1 | Летает между телами; цели `trade` и `delivery` уже записываются в память агента, но торговля товарами будет добавлена отдельным экономическим слоем. |
| `patrol` — патруль | 55–125 с | patrol 8, defend 6, hunt 2, trade 1 | Патрулирует случайные тела. При `defend`/`hunt` пытается приблизиться к игроку: на дальней дистанции прыгает к его главному телу, на ближней включает тягу. |
| `geologist` — геолог | 110–230 с | survey 9, mine 7, trade 2, flee 2 | Переходит между телами для исследований и добычи; цели `survey`/`mine` доступны сценариям через blackboard и hooks. Физическая добыча пока не создаёт груз автоматически. |
| `courier` — курьер | 65–145 с | delivery 10, trade 4, flee 3, explore 2 | Предпочитает быстрые перелёты между телами; `delivery` хранится как текущая миссия и может быть привязана к контракту через hook. |
| `ranger` — рейнджер | 70–160 с | explore 8, patrol 4, defend 4, survey 3 | Исследует систему, патрулирует и реагирует на цели защиты так же, как патруль. |
| `pirate` — пират | 45–100 с | hunt 9, raid 7, flee 2, explore 1 | Агрессивно сближается с игроком для `hunt`/`raid`; вооружение NPC и собственно выстрел агента оставлены настраиваемым hook-слоем, чтобы фракции не получали скрытую жёсткую боевую логику. |

`flee` всегда выбирает другое тело и совершает FSD-прыжок. Для `hunt`, `raid` и
`defend` цель — корабль игрока; при расстоянии больше `engagementRange` агент
прыгает к его текущему главному телу, при меньшем — продолжает сближение на
тяге. Все решения добавляются в `agent.state.history`, а активная цель и
служебные сведения доступны через `agent.state.blackboard`.

Стандартные профили не содержат жёстких `rules`: это намеренно оставляет
фракции и миссии полностью конфигурируемыми. Готовые условия `damaged`,
`player_near` и `cargo_full`, либо пользовательская функция `when`, позволяют
добавить реакцию без изменения контроллера.

Configure a generated system through the third constructor parameter:

```js
const scene = new SystemScene(galaxy, star, {
  agentConfig: {
    pirate: {
      goalWeights: { hunt: 14, raid: 9, flee: 1 },
      engagementRange: 110,
      rules: [{ when: "damaged", below: 0.3, action: "flee" }]
    },
    default: { cadence: [45, 90] }
  }
});
```

`when` can also be a function receiving `{agent, npc, sys, state}`, and
`hooks.onGoal` receives the same context plus `goal` and `target`. Runtime
profiles can be changed with `scene.configureAgents(config)`.

## Бой и следование

У каждого NPC теперь есть фракция: `pirate` атакует игрока и гражданские
корабли, а `security` отвечает на пиратов. Оружие и щит устанавливаются из
того же каталога модулей, что и у игрока. Выстрелы проходят общий контур
урона: щиты, ЭМИ, боезапас и уничтожение корабля работают для обеих сторон.

Следование непрерывно: пока цели находятся у разных небесных тел, NPC делает
FSD-переход к главному телу цели; затем в ньютоновском полёте удерживает
дистанцию, доворачивает корпус и меняет тягу. Скрипт или миссия может выдать
постоянный приказ `agent.setOrder("follow", ship, { distance: 30 })` либо
`agent.setOrder("attack", ship)`; второй вариант сохраняет строй и открывает
огонь при входе цели в дальность активного орудия.
