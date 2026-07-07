# IconButton

Square (or round) icon-only control used throughout the app chrome — hamburger menu, modal close ×, day steppers. Hairline border, brightens on hover, shrinks slightly on press.

```jsx
<IconButton label="Menu"><MenuSvg /></IconButton>
<IconButton label="Close" shape="round" bordered={false}>×</IconButton>
```

Props: `label` (required), `shape` (`square`/`round`), `size`, `bordered`.
