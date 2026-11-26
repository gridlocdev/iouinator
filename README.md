# IOUinator

IOUinator keeps track of who owes whom in a group. You list the people, record each debt with an amount and what it was for, and a diagram shows the totals between everyone. It runs as a desktop app and in the browser.

![IOUinator with three people, Sam, Alex and Jo, in the People pane with their balances. The Transactions pane lists debts such as "Sam → Alex, Pizza, $12.50". The Diagram pane shows a left-to-right diagram with an arrow and a total between each pair, and a Totals table under it.](docs/images/screenshot.png)

- **Record debts from the keyboard.** Who owes, whom, how much and what for, in one form that stays ready for the next one.
- **See every total at a glance.** A Mermaid diagram draws one arrow per direction with its total; click an arrow or a person to see the transactions behind it.
- **Flatten loops.** When debts go round in a circle (Sam owes Alex, Alex owes Jo, Jo owes Sam), the flattened view cancels the loop, leaving fewer and smaller debts with the same balance for everyone.

## Getting started

Download the desktop app for macOS, Windows or Linux from [Releases](https://github.com/gridlocdev/iouinator/releases). The macOS app isn't notarized by Apple, so the first time you open it, choose **Open Anyway** in System Settings → Privacy & Security. [Getting started](docs/getting-started.md) covers running it in the browser and from source.

## Learn more

[Features](docs/features.md) · [Controls](docs/controls.md) · [Credits](docs/credits.md)

[All docs](docs/README.md) · [Development](docs/development.md) · [Glossary](GLOSSARY.md)

## License

[MIT](LICENSE)
