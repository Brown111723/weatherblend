/* @ds-bundle: {"format":4,"namespace":"WeatherBlendDesignSystem_0cb5aa","components":[{"name":"Logo","sourcePath":"components/brand/Logo.jsx"},{"name":"Button","sourcePath":"components/core/Button.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Segment","sourcePath":"components/core/Segment.jsx"},{"name":"Toggle","sourcePath":"components/core/Toggle.jsx"},{"name":"ConfidenceTag","sourcePath":"components/data/ConfidenceTag.jsx"},{"name":"MetricCard","sourcePath":"components/data/MetricCard.jsx"},{"name":"MODELS","sourcePath":"components/data/ModelBadge.jsx"},{"name":"ModelBadge","sourcePath":"components/data/ModelBadge.jsx"},{"name":"WeightBadge","sourcePath":"components/data/ModelBadge.jsx"},{"name":"ModelToggle","sourcePath":"components/data/ModelToggle.jsx"},{"name":"Modal","sourcePath":"components/feedback/Modal.jsx"},{"name":"BottomNav","sourcePath":"components/navigation/BottomNav.jsx"},{"name":"Drawer","sourcePath":"components/navigation/Drawer.jsx"},{"name":"DayTile","sourcePath":"components/weather/DayTile.jsx"},{"name":"MetricIcon","sourcePath":"components/weather/MetricIcon.jsx"},{"name":"Sparkline","sourcePath":"components/weather/Sparkline.jsx"},{"name":"WeatherIcon","sourcePath":"components/weather/WeatherIcon.jsx"},{"name":"WeatherOrb","sourcePath":"components/weather/WeatherOrb.jsx"}],"sourceHashes":{"components/brand/Logo.jsx":"85cd4924a952","components/core/Button.jsx":"904bf25d3b0d","components/core/IconButton.jsx":"3bc71ec630c3","components/core/Segment.jsx":"03353f5bf73d","components/core/Toggle.jsx":"d82af7f1729a","components/data/ConfidenceTag.jsx":"300bd8f48066","components/data/MetricCard.jsx":"3751bb01d8f5","components/data/ModelBadge.jsx":"9eed1002f180","components/data/ModelToggle.jsx":"625acf168c07","components/feedback/Modal.jsx":"e6f946e22cd2","components/navigation/BottomNav.jsx":"62492df923f8","components/navigation/Drawer.jsx":"235c7d2c6f63","components/weather/DayTile.jsx":"a5eed67254bb","components/weather/MetricIcon.jsx":"00abfa7a659d","components/weather/Sparkline.jsx":"043bb04a20e7","components/weather/WeatherIcon.jsx":"5bad9345bed6","components/weather/WeatherOrb.jsx":"842e4951d25e","explorations/timelines-v2/app.jsx":"86607a83a050","explorations/timelines-v2/panel.jsx":"f334b26d08fd","explorations/timelines-v2/streams.jsx":"ce0d4b16293d","explorations/timelines-v2/week.jsx":"8a4d584b1f33"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.WeatherBlendDesignSystem_0cb5aa = window.WeatherBlendDesignSystem_0cb5aa || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/brand/Logo.jsx
try { (() => {
/**
 * Logo — the WeatherBlend quatrefoil mark: four overlapping circles in
 * the metric palette (lime/mint/blue/purple). Optionally paired with the
 * "WeatherBlend" wordmark, whose "Blend" carries a mint→blue gradient.
 */
function Logo({
  size = 30,
  wordmark = false,
  style = {}
}) {
  const mark = /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 64 64",
    width: size,
    height: size,
    style: {
      display: 'block',
      flexShrink: 0
    },
    "aria-label": "WeatherBlend"
  }, /*#__PURE__*/React.createElement("circle", {
    cx: "20",
    cy: "32",
    r: "12",
    fill: "#A8E63E"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "20",
    r: "12",
    fill: "#7EE8A5"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "44",
    cy: "32",
    r: "12",
    fill: "#5FA4FF"
  }), /*#__PURE__*/React.createElement("circle", {
    cx: "32",
    cy: "44",
    r: "12",
    fill: "#C8A6FF"
  }));
  if (!wordmark) return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      ...style
    }
  }, mark);
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 9,
      ...style
    }
  }, mark, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: Math.round(size * 0.66),
      fontWeight: 700,
      letterSpacing: '-.3px',
      color: 'var(--wb-text)'
    }
  }, "Weather", /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'linear-gradient(90deg,var(--q-temp),var(--q-rain))',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      WebkitTextFillColor: 'transparent'
    }
  }, "Blend")));
}
Object.assign(__ds_scope, { Logo });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/brand/Logo.jsx", error: String((e && e.message) || e) }); }

// components/core/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * WeatherBlend Button — the app's primary action control.
 * Solid accent-blue by default; a muted "secondary" fill and a borderless
 * "ghost" for low-emphasis actions. Rounded 10px, gentle scale on press.
 */
function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  icon = null,
  style = {},
  ...rest
}) {
  const pad = size === 'sm' ? '8px 14px' : size === 'lg' ? '13px 20px' : '11px 16px';
  const fs = size === 'sm' ? '13px' : size === 'lg' ? '16px' : '15px';
  const variants = {
    primary: {
      background: 'var(--wb-accent)',
      color: '#fff',
      border: '1px solid transparent'
    },
    secondary: {
      background: 'var(--wb-surface-2)',
      color: 'var(--wb-text)',
      border: '1px solid var(--wb-border-2)'
    },
    ghost: {
      background: 'transparent',
      color: 'var(--wb-text-muted)',
      border: '1px solid transparent'
    }
  };
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    width: fullWidth ? '100%' : undefined,
    padding: pad,
    fontFamily: 'var(--wb-font-sans)',
    fontSize: fs,
    fontWeight: 600,
    lineHeight: 1,
    borderRadius: 'var(--wb-radius-md)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    transition: 'background var(--wb-dur-fast), border-color var(--wb-dur-fast), transform .1s',
    WebkitTapHighlightColor: 'transparent',
    ...variants[variant],
    ...style
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    disabled: disabled,
    style: base,
    onMouseDown: e => {
      if (!disabled) e.currentTarget.style.transform = 'scale(0.96)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), icon, children);
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * IconButton — square, icon-only control used across the app chrome
 * (hamburger, close ×, day steppers). Rounded, hairline border by
 * default, brightens on hover. Pass an SVG (or ×) as children.
 */
function IconButton({
  children,
  label,
  shape = 'square',
  size = 38,
  bordered = true,
  style = {},
  ...rest
}) {
  const radius = shape === 'round' ? '50%' : 'var(--wb-radius-lg)';
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size,
    height: size,
    flexShrink: 0,
    padding: 0,
    borderRadius: radius,
    border: bordered ? '1px solid var(--wb-border)' : 'none',
    background: 'transparent',
    color: 'var(--wb-text-muted)',
    cursor: 'pointer',
    transition: 'background var(--wb-dur-fast), color var(--wb-dur-fast), transform .1s',
    WebkitTapHighlightColor: 'transparent',
    ...style
  };
  return /*#__PURE__*/React.createElement("button", _extends({
    "aria-label": label,
    title: label,
    style: base,
    onMouseEnter: e => {
      e.currentTarget.style.background = 'var(--wb-border-2)';
      e.currentTarget.style.color = 'var(--wb-text)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.background = 'transparent';
      e.currentTarget.style.color = 'var(--wb-text-muted)';
      e.currentTarget.style.transform = 'scale(1)';
    },
    onMouseDown: e => {
      e.currentTarget.style.transform = 'scale(0.9)';
    },
    onMouseUp: e => {
      e.currentTarget.style.transform = 'scale(1)';
    }
  }, rest), children);
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Segment.jsx
try { (() => {
/**
 * Segment — segmented control (the app's "Recency / Per-day / Blend"
 * and view switchers). One bordered pill, dividers between options,
 * the active option filled with the accent wash.
 */
function Segment({
  options = [],
  value,
  onChange = () => {},
  style = {}
}) {
  const wrap = {
    display: 'flex',
    border: '1px solid var(--wb-border-2)',
    borderRadius: 'var(--wb-radius-md)',
    overflow: 'hidden',
    background: 'rgba(255,255,255,.03)',
    ...style
  };
  return /*#__PURE__*/React.createElement("div", {
    style: wrap,
    role: "tablist"
  }, options.map((opt, i) => {
    const val = typeof opt === 'string' ? opt : opt.value;
    const label = typeof opt === 'string' ? opt : opt.label;
    const on = val === value;
    return /*#__PURE__*/React.createElement("button", {
      key: val,
      role: "tab",
      "aria-selected": on,
      onClick: () => onChange(val),
      style: {
        flex: 1,
        padding: '8px 10px',
        fontFamily: 'var(--wb-font-sans)',
        fontSize: '12px',
        fontWeight: 600,
        color: on ? 'var(--wb-text)' : 'var(--wb-text-muted)',
        background: on ? 'var(--wb-accent-soft)' : 'transparent',
        border: 'none',
        borderRight: i < options.length - 1 ? '1px solid var(--wb-border-2)' : 'none',
        cursor: 'pointer',
        transition: 'background var(--wb-dur-fast), color var(--wb-dur-fast)',
        whiteSpace: 'nowrap'
      }
    }, label);
  }));
}
Object.assign(__ds_scope, { Segment });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Segment.jsx", error: String((e && e.message) || e) }); }

// components/core/Toggle.jsx
try { (() => {
/**
 * Toggle — the icon-square toggle used in the Sources panel for the
 * Show / Confidence metric switches. A 40px rounded button holding an
 * icon, with a caption below. When enabled the icon takes its metric
 * (quatrefoil) colour and the button fills; when off it dims.
 */
function Toggle({
  icon,
  label,
  enabled = false,
  color = 'var(--wb-text)',
  onClick = () => {},
  style = {}
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => onClick(!enabled),
    style: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '3px',
      width: 54,
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 40,
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 'var(--wb-radius-md)',
      border: `1px solid ${enabled ? 'var(--wb-border-2)' : 'var(--wb-border)'}`,
      background: enabled ? 'var(--wb-surface)' : 'transparent',
      color: enabled ? color : 'var(--wb-text-muted)',
      opacity: enabled ? 1 : 0.4,
      transition: 'all var(--wb-dur-fast)'
    }
  }, icon), /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '9px',
      color: enabled ? 'var(--wb-text-muted)' : 'var(--wb-text-dim)',
      textAlign: 'center',
      maxWidth: 54,
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap'
    }
  }, label));
}
Object.assign(__ds_scope, { Toggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Toggle.jsx", error: String((e && e.message) || e) }); }

// components/data/ConfidenceTag.jsx
try { (() => {
function levelOf(v) {
  if (typeof v === 'string') return v;
  if (v >= 67) return 'High';
  if (v >= 34) return 'Medium';
  return 'Low';
}
const COLORS = {
  High: 'var(--wb-conf-high)',
  Medium: 'var(--wb-conf-mid)',
  Low: 'var(--wb-conf-low)'
};

/**
 * ConfidenceTag — the plain-English model-agreement read-out
 * (High / Medium / Low), coloured green / amber / rose. Optionally
 * shows the underlying percentage. Confidence measures how much the
 * models AGREE — not certainty.
 */
function ConfidenceTag({
  value = 'High',
  showPct = false,
  style = {}
}) {
  const level = levelOf(value);
  const pct = typeof value === 'number' ? Math.round(value) : null;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '12px',
      fontWeight: 700,
      color: COLORS[level] || COLORS.High,
      ...style
    }
  }, level, showPct && pct != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      opacity: 0.8
    }
  }, " \xB7 ", pct, "%"));
}
Object.assign(__ds_scope, { ConfidenceTag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ConfidenceTag.jsx", error: String((e && e.message) || e) }); }

// components/data/MetricCard.jsx
try { (() => {
const ACCENT = {
  temp: 'var(--q-temp)',
  rain: 'var(--q-rain)',
  wind: 'var(--q-wind)',
  cloud: 'var(--q-cloud)'
};

/**
 * MetricCard — the glassy metric box from the cards view. A quatrefoil
 * top-accent in the metric's colour, an uppercase title, a big value and
 * one or two muted sub-lines. Optional confidence % appended to the title.
 */
function MetricCard({
  metric = 'temp',
  title,
  value,
  subs = [],
  confidence,
  glass = false,
  style = {}
}) {
  const color = ACCENT[metric] || ACCENT.temp;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      background: glass ? 'var(--wb-glass-fill)' : 'var(--wb-surface)',
      border: glass ? '1px solid var(--wb-glass-border)' : '1px solid var(--wb-border)',
      borderTop: `2px solid ${color}`,
      borderRadius: 'var(--wb-radius-xl)',
      padding: '12px 13px',
      minHeight: 98,
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      backdropFilter: glass ? 'blur(3px)' : undefined,
      WebkitBackdropFilter: glass ? 'blur(3px)' : undefined,
      overflow: 'hidden',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '11px',
      fontWeight: 700,
      letterSpacing: '1.1px',
      textTransform: 'uppercase',
      marginBottom: 3,
      color
    }
  }, title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '25px',
      fontWeight: 700,
      letterSpacing: '-.5px',
      lineHeight: 1.1,
      color: 'var(--wb-text)',
      whiteSpace: 'nowrap'
    }
  }, value, confidence != null && /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      fontWeight: 700,
      opacity: 0.62,
      marginLeft: 6,
      color
    }
  }, confidence, "%")), subs.map((s, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '12.5px',
      color: 'var(--wb-text-muted)',
      lineHeight: 1.5,
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis'
    }
  }, s)));
}
Object.assign(__ds_scope, { MetricCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/MetricCard.jsx", error: String((e && e.message) || e) }); }

// components/data/ModelBadge.jsx
try { (() => {
/** The 7 global weather models, with their fixed identity colours. */
const MODELS = {
  gfs: {
    short: 'G',
    color: 'var(--wb-model-gfs)',
    label: 'GFS',
    desc: 'NOAA · USA'
  },
  ecmwf: {
    short: 'E',
    color: 'var(--wb-model-ecmwf)',
    label: 'ECMWF',
    desc: 'ECMWF · 0.25°'
  },
  icon: {
    short: 'I',
    color: 'var(--wb-model-icon)',
    label: 'ICON',
    desc: 'DWD · Germany'
  },
  gem: {
    short: 'C',
    color: 'var(--wb-model-gem)',
    label: 'GEM',
    desc: 'Env. Canada'
  },
  ukmo: {
    short: 'U',
    color: 'var(--wb-model-ukmo)',
    label: 'UKMO',
    desc: 'Met Office · UK'
  },
  cma: {
    short: 'X',
    color: 'var(--wb-model-cma)',
    label: 'CMA',
    desc: 'CMA · China'
  },
  jma: {
    short: 'J',
    color: 'var(--wb-model-jma)',
    label: 'JMA',
    desc: 'JMA · Japan'
  }
};

/**
 * ModelBadge — a coloured round "dot" carrying the model's short letter,
 * optionally followed by its current blend-weight percentage. This is how
 * each of the 7 source models is identified in tables and panels.
 */
function ModelBadge({
  model = 'gfs',
  weight,
  size = 22,
  style = {}
}) {
  const m = typeof model === 'string' ? MODELS[model] || MODELS.gfs : model;
  return /*#__PURE__*/React.createElement("span", {
    style: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: size,
      height: size,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '10px',
      fontWeight: 700,
      color: '#fff',
      flexShrink: 0,
      background: m.color
    }
  }, m.short), weight != null && /*#__PURE__*/React.createElement(WeightBadge, {
    weight: weight
  }));
}

/** WeightBadge — a blend-weight percentage, coloured by magnitude. */
function WeightBadge({
  weight = 0,
  style = {}
}) {
  const pct = Math.round(weight <= 1 ? weight * 100 : weight);
  const color = pct >= 20 ? 'var(--wb-conf-high)' : pct >= 10 ? 'var(--wb-conf-mid)' : 'var(--wb-conf-low)';
  return /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '10px',
      fontWeight: 500,
      color,
      ...style
    }
  }, pct, "%");
}
Object.assign(__ds_scope, { MODELS, ModelBadge, WeightBadge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ModelBadge.jsx", error: String((e && e.message) || e) }); }

// components/data/ModelToggle.jsx
try { (() => {
/**
 * ModelToggle — a source-model row from the "Models & sources" panel.
 * The model's coloured dot, its name and description, in a bordered pill
 * that fills when enabled, dims when disabled, and shows an italic
 * "unavailable" note when the model returned no data.
 */
function ModelToggle({
  model = 'gfs',
  enabled = true,
  unavailable = false,
  onClick = () => {},
  style = {}
}) {
  const m = typeof model === 'string' ? __ds_scope.MODELS[model] || __ds_scope.MODELS.gfs : model;
  const off = !enabled || unavailable;
  return /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      if (!unavailable) onClick(!enabled);
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 7,
      padding: '7px 11px',
      borderRadius: 'var(--wb-radius-md)',
      border: `1px solid ${unavailable ? '#3a1a0a' : enabled ? 'var(--wb-border-2)' : 'var(--wb-border)'}`,
      background: enabled && !unavailable ? 'var(--wb-surface)' : 'transparent',
      opacity: off ? unavailable ? 0.5 : 0.4 : 1,
      cursor: unavailable ? 'default' : 'pointer',
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '14px',
      transition: 'all var(--wb-dur-fast)',
      WebkitTapHighlightColor: 'transparent',
      ...style
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      width: 22,
      height: 22,
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '10px',
      fontWeight: 700,
      color: '#fff',
      flexShrink: 0,
      background: m.color
    }
  }, m.short), /*#__PURE__*/React.createElement("span", {
    style: {
      fontWeight: 600,
      color: 'var(--wb-text)'
    }
  }, m.label), unavailable ? /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '12px',
      color: '#b45309',
      fontStyle: 'italic'
    }
  }, "unavailable") : /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: '13px',
      color: 'var(--wb-text-muted)'
    }
  }, m.desc));
}
Object.assign(__ds_scope, { ModelToggle });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ModelToggle.jsx", error: String((e && e.message) || e) }); }

// components/feedback/Modal.jsx
try { (() => {
/**
 * Modal — the app's centered dialog (Help, Accuracy, City search). A
 * dimmed backdrop, a rounded surface card capped at 540px with its own
 * scroll, a close × in the corner, and an optional sticky footer button.
 * Click the backdrop to dismiss.
 */
function Modal({
  open = true,
  title,
  subtitle,
  children,
  onClose = () => {},
  maxWidth = 540,
  footer,
  style = {}
}) {
  if (!open) return null;
  return /*#__PURE__*/React.createElement("div", {
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    },
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.7)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      background: 'var(--wb-surface)',
      border: '1px solid var(--wb-border-2)',
      borderRadius: 'var(--wb-radius-2xl)',
      maxWidth,
      width: '100%',
      maxHeight: '85vh',
      overflowY: 'auto',
      padding: 28,
      ...style
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      position: 'absolute',
      top: 14,
      right: 14,
      width: 30,
      height: 30,
      borderRadius: 'var(--wb-radius-sm)',
      border: '1px solid var(--wb-border-2)',
      background: 'var(--wb-surface-2)',
      color: 'var(--wb-text-muted)',
      fontSize: 14,
      lineHeight: 1,
      cursor: 'pointer',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 6
    }
  }, "\u2715"), title && /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: 20,
      fontWeight: 700,
      color: 'var(--wb-text)',
      margin: 0,
      marginBottom: subtitle ? 4 : 12
    }
  }, title), subtitle && /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: 13,
      color: 'var(--wb-text-muted)',
      marginBottom: 20
    }
  }, subtitle), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: 14,
      color: 'var(--wb-text-muted)',
      lineHeight: 1.6
    }
  }, children), footer));
}
Object.assign(__ds_scope, { Modal });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/feedback/Modal.jsx", error: String((e && e.message) || e) }); }

// components/navigation/BottomNav.jsx
try { (() => {
/**
 * BottomNav — the app's fixed bottom section switcher (Cards / Table /
 * Map). Icon over a tiny label; the active item takes the accent wash
 * and a lighter blue. Render it inside a fixed footer wrapper.
 */
function BottomNav({
  items = [],
  active,
  onChange = () => {},
  style = {}
}) {
  return /*#__PURE__*/React.createElement("nav", {
    style: {
      display: 'flex',
      justifyContent: 'space-around',
      alignItems: 'stretch',
      background: 'linear-gradient(0deg,#0d121c,#121925)',
      borderTop: '1px solid var(--wb-border-2)',
      padding: '4px 6px',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      ...style
    }
  }, items.map(it => {
    const on = it.id === active;
    return /*#__PURE__*/React.createElement("button", {
      key: it.id,
      onClick: () => onChange(it.id),
      style: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
        padding: '7px 4px',
        border: 'none',
        background: on ? 'var(--wb-accent-soft)' : 'none',
        color: on ? '#bfdbfe' : 'var(--wb-text-dim)',
        fontFamily: 'var(--wb-font-sans)',
        fontSize: 11,
        fontWeight: 600,
        borderRadius: 'var(--wb-radius-md)',
        cursor: 'pointer',
        transition: 'color var(--wb-dur-fast), background var(--wb-dur-fast)',
        WebkitTapHighlightColor: 'transparent'
      }
    }, it.icon, /*#__PURE__*/React.createElement("span", null, it.label));
  }));
}
Object.assign(__ds_scope, { BottomNav });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/BottomNav.jsx", error: String((e && e.message) || e) }); }

// components/navigation/Drawer.jsx
try { (() => {
/**
 * Drawer — the slide-in left menu (☰). A dimmed overlay and a 280px
 * panel with the brand header, an uppercase section label and a list of
 * list-style items that highlight to the accent on hover. Provide items
 * as {label, icon, onClick} or pass arbitrary children.
 */
function Drawer({
  open = false,
  onClose = () => {},
  label = 'Options',
  items = [],
  children,
  style = {}
}) {
  return /*#__PURE__*/React.createElement("div", {
    onClick: e => {
      if (e.target === e.currentTarget) onClose();
    },
    style: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,.55)',
      zIndex: 500,
      display: open ? 'block' : 'none'
    }
  }, /*#__PURE__*/React.createElement("aside", {
    style: {
      position: 'absolute',
      left: 0,
      top: 0,
      bottom: 0,
      width: 280,
      maxWidth: '82vw',
      background: 'var(--wb-surface)',
      borderRight: '1px solid var(--wb-border-2)',
      boxShadow: 'var(--wb-shadow-modal)',
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      transform: open ? 'translateX(0)' : 'translateX(-100%)',
      transition: 'transform var(--wb-dur-drawer) var(--wb-ease)',
      overflowY: 'auto',
      ...style
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Logo, {
    size: 26,
    wordmark: true
  }), /*#__PURE__*/React.createElement("button", {
    onClick: onClose,
    "aria-label": "Close",
    style: {
      width: 32,
      height: 32,
      borderRadius: 'var(--wb-radius-sm)',
      border: '1px solid var(--wb-border-2)',
      background: 'var(--wb-surface-2)',
      color: 'var(--wb-text-muted)',
      fontSize: 20,
      lineHeight: 1,
      cursor: 'pointer'
    }
  }, "\xD7")), children ?? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: '1px',
      textTransform: 'uppercase',
      color: 'var(--wb-text-dim)',
      marginTop: 6
    }
  }, label), items.map((it, i) => /*#__PURE__*/React.createElement("button", {
    key: i,
    onClick: () => {
      it.onClick?.();
      onClose();
    },
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 11,
      padding: '11px 12px',
      borderRadius: 'var(--wb-radius-md)',
      border: '1px solid var(--wb-border)',
      background: 'var(--wb-surface-2)',
      color: 'var(--wb-text)',
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '14.5px',
      fontWeight: 500,
      cursor: 'pointer',
      textAlign: 'left'
    },
    onMouseEnter: e => {
      e.currentTarget.style.borderColor = 'var(--wb-accent)';
      e.currentTarget.style.background = 'var(--wb-accent-soft)';
    },
    onMouseLeave: e => {
      e.currentTarget.style.borderColor = 'var(--wb-border)';
      e.currentTarget.style.background = 'var(--wb-surface-2)';
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--wb-text-muted)',
      display: 'inline-flex',
      flexShrink: 0
    }
  }, it.icon), it.label)))));
}
Object.assign(__ds_scope, { Drawer });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/Drawer.jsx", error: String((e && e.message) || e) }); }

// components/weather/MetricIcon.jsx
try { (() => {
/* Metric line-icons — copied verbatim from the product (app.js MI_*).
   Drawn with currentColor so they inherit the quatrefoil hue. */
const PATHS = {
  temp: {
    fill: 'none',
    stroke: true,
    sw: 2.2,
    inner: '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/>'
  },
  rain: {
    fill: 'currentColor',
    stroke: false,
    inner: '<path d="M12 2.7c2.9 4 5.3 7 5.3 10A5.3 5.3 0 0 1 12 18a5.3 5.3 0 0 1-5.3-5.3c0-3 2.4-6 5.3-10z"/>'
  },
  wind: {
    fill: 'none',
    stroke: true,
    sw: 2.2,
    inner: '<path d="M3 8h10.5a2.5 2.5 0 1 0-2.4-3.2"/><path d="M3 16h7.5a2.5 2.5 0 1 1-2.4 3.2"/><path d="M3 12h15a2.5 2.5 0 1 0-2.4-3.2"/>'
  },
  cloud: {
    fill: 'currentColor',
    stroke: false,
    inner: '<path d="M7 18h10a3.8 3.8 0 0 0 .5-7.6 5.3 5.3 0 0 0-10.2-1.1A3.6 3.6 0 0 0 7 18z"/>'
  }
};
const DEFAULT_COLOR = {
  temp: 'var(--q-temp)',
  rain: 'var(--q-rain)',
  wind: 'var(--q-wind)',
  cloud: 'var(--q-cloud)'
};

/**
 * MetricIcon — the small line-glyph for a single metric
 * (temperature thermometer, rain drop, wind streams, cloud). Uses
 * currentColor; defaults to that metric's quatrefoil hue.
 */
function MetricIcon({
  metric = 'temp',
  size = 16,
  color,
  style = {}
}) {
  const p = PATHS[metric] || PATHS.temp;
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: p.fill,
    stroke: p.stroke ? 'currentColor' : 'none',
    strokeWidth: p.sw,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      display: 'inline-block',
      color: color || DEFAULT_COLOR[metric],
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: p.inner
    }
  });
}
Object.assign(__ds_scope, { MetricIcon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/weather/MetricIcon.jsx", error: String((e && e.message) || e) }); }

// components/weather/Sparkline.jsx
try { (() => {
const RAMPS = {
  temp: v => v < 5 ? '#60a5fa' : v < 12 ? '#38bdf8' : v < 22 ? '#4ade80' : v < 30 ? '#fbbf24' : '#f87171',
  rain: v => v < 0.05 ? '#1e3a5f' : v < 0.2 ? '#3b82f6' : v < 0.5 ? '#2563eb' : v < 1 ? '#1d4ed8' : v < 2 ? '#1e40af' : '#172554',
  wind: v => v < 10 ? '#22c55e' : v < 20 ? '#84cc16' : v < 35 ? '#eab308' : v < 55 ? '#f97316' : '#ef4444',
  cloud: v => v < 12 ? '#60a5fa' : v < 40 ? '#818cf8' : v < 70 ? '#a78bfa' : '#8b5cf6'
};
let _uid = 0;

/**
 * Sparkline — the hero day-trace from the condition card. A metric's
 * hourly values drawn as a value-ramped line over a soft gradient area;
 * the segment past `split` is dashed to mark forecast-vs-observed.
 * Optional amber tick lines mark sunrise/sunset. Fills its container.
 */
function Sparkline({
  values = [],
  metric = 'temp',
  split = 1,
  zeroBase = false,
  ticks = [],
  height = 44,
  style = {}
}) {
  const W = 240,
    H = height,
    padX = 2,
    padT = 6,
    padB = 5;
  const ramp = RAMPS[metric] || RAMPS.temp;
  const n = values.length;
  const clean = values.filter(v => v != null && !isNaN(v));
  const gid = `wbspark${_uid++}`;
  if (!clean.length) return /*#__PURE__*/React.createElement("div", {
    style: {
      height: H,
      ...style
    }
  });
  let mn = Math.min(...clean),
    mx = Math.max(...clean);
  if (zeroBase) mn = 0;
  if (mn === mx) {
    if (zeroBase) mx = mn + 1;else {
      mn -= 1;
      mx += 1;
    }
  }
  const X = i => padX + (n > 1 ? i * (W - 2 * padX) / (n - 1) : 0);
  const Y = v => v == null ? null : H - padB - (Math.max(mn, Math.min(mx, v)) - mn) / (mx - mn) * (H - padT - padB);
  const pts = values.map((v, i) => v == null ? null : [X(i), Y(v)]);
  const path = arr => {
    let d = '',
      on = false;
    arr.forEach(p => {
      if (!p) {
        on = false;
        return;
      }
      d += (on ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' ';
      on = true;
    });
    return d.trim();
  };
  const cut = split * (W - 2 * padX) + padX;
  const solid = pts.map(p => p && p[0] <= cut + 0.6 ? p : null);
  const dash = split < 1 ? pts.map(p => p && p[0] >= cut - 0.6 ? p : null) : null;
  const firstX = pts.find(p => p)[0];
  const area = path(pts) + ` L ${X(n - 1).toFixed(1)} ${H - padB} L ${firstX.toFixed(1)} ${H - padB} Z`;
  const stops = values.map((v, i) => v == null ? null : `<stop offset="${(n > 1 ? i / (n - 1) : 0) * 100}%" stop-color="${ramp(v)}" stop-opacity="0.45"/>`).filter(Boolean).join('');
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: `0 0 ${W} ${H}`,
    preserveAspectRatio: "none",
    style: {
      display: 'block',
      width: '100%',
      height: H,
      overflow: 'visible',
      ...style
    }
  }, /*#__PURE__*/React.createElement("defs", {
    dangerouslySetInnerHTML: {
      __html: `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>`
    }
  }), /*#__PURE__*/React.createElement("path", {
    d: area,
    fill: `url(#${gid})`,
    stroke: "none",
    opacity: "0.5"
  }), ticks.map((t, i) => {
    const gx = (t.frac * (W - 2 * padX) + padX).toFixed(1);
    return /*#__PURE__*/React.createElement("line", {
      key: i,
      x1: gx,
      y1: padT - 2,
      x2: gx,
      y2: H - padB + 1,
      stroke: "#e7a755",
      strokeWidth: "1",
      opacity: "0.25",
      strokeDasharray: "1.5 2",
      strokeLinecap: "round",
      vectorEffect: "non-scaling-stroke"
    });
  }), /*#__PURE__*/React.createElement("path", {
    d: path(solid),
    fill: "none",
    stroke: `var(--q-${metric})`,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    vectorEffect: "non-scaling-stroke"
  }), dash && /*#__PURE__*/React.createElement("path", {
    d: path(dash),
    fill: "none",
    stroke: `var(--q-${metric})`,
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeDasharray: "3 3",
    opacity: "0.7",
    vectorEffect: "non-scaling-stroke"
  }));
}
Object.assign(__ds_scope, { Sparkline });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/weather/Sparkline.jsx", error: String((e && e.message) || e) }); }

// components/weather/DayTile.jsx
try { (() => {
/**
 * DayTile — one tile in the fingerprint day-selector strip. A weekday
 * label, a tiny temperature spark, the day's high/low and rain total.
 * States: selected (accent ring + wash), today (dot after the label),
 * past (dimmed).
 */
function DayTile({
  dow = 'Mon',
  hi,
  lo,
  rain = 0,
  values = [],
  selected = false,
  today = false,
  past = false,
  onClick = () => {},
  style = {}
}) {
  return /*#__PURE__*/React.createElement("button", {
    onClick: onClick,
    style: {
      flex: '0 0 auto',
      width: 76,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '3px',
      padding: '8px 6px 7px',
      borderRadius: 'var(--wb-radius-lg)',
      border: `1px solid ${selected ? 'var(--wb-accent)' : 'var(--wb-border)'}`,
      background: selected ? 'var(--wb-accent-soft)' : 'rgba(255,255,255,.022)',
      opacity: past && !selected ? 0.6 : 1,
      cursor: 'pointer',
      transition: 'border-color var(--wb-dur-fast), background var(--wb-dur-fast)',
      WebkitTapHighlightColor: 'transparent'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '10.5px',
      fontWeight: 700,
      letterSpacing: '.4px',
      lineHeight: 1,
      color: today ? 'var(--wb-text)' : 'var(--wb-text-muted)'
    }
  }, dow, today && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--wb-accent)',
      marginLeft: 3
    }
  }, "\u2022")), /*#__PURE__*/React.createElement("div", {
    style: {
      width: 62,
      height: 28
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Sparkline, {
    values: values,
    metric: "temp",
    height: 28
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      gap: '7px',
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '10px',
      fontWeight: 600,
      lineHeight: 1,
      color: 'var(--wb-text-dim)'
    }
  }, /*#__PURE__*/React.createElement("b", {
    style: {
      color: 'var(--wb-text)',
      fontWeight: 700,
      fontSize: '10.5px'
    }
  }, hi != null ? Math.round(hi) + '°' : '—'), /*#__PURE__*/React.createElement("span", null, lo != null ? Math.round(lo) + '°' : '—')), /*#__PURE__*/React.createElement("div", {
    style: {
      fontFamily: 'var(--wb-font-sans)',
      fontSize: '9.5px',
      fontWeight: rain >= 0.2 ? 700 : 600,
      lineHeight: 1,
      minHeight: 10,
      color: rain >= 0.2 ? 'var(--q-rain)' : 'var(--wb-text-dim)',
      opacity: rain >= 0.2 ? 1 : 0.55
    }
  }, rain >= 0.2 ? rain.toFixed(1) + ' mm' : 'dry'));
}
Object.assign(__ds_scope, { DayTile });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/weather/DayTile.jsx", error: String((e && e.message) || e) }); }

// components/weather/WeatherIcon.jsx
try { (() => {
/* Glyph parts — copied verbatim from the product (app.js). Each is inner
   SVG markup on a 24×24 canvas, composed by weather code. */
const _sun = '<circle cx="12" cy="12" r="4.6" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="1.6" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22.4"/><line x1="1.6" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22.4" y2="12"/><line x1="4.5" y1="4.5" x2="6.2" y2="6.2"/><line x1="17.8" y1="17.8" x2="19.5" y2="19.5"/><line x1="19.5" y1="4.5" x2="17.8" y2="6.2"/><line x1="6.2" y1="17.8" x2="4.5" y2="19.5"/></g>';
const _moon = '<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5 6.7 6.7 0 0 0 20.5 14.2z" fill="#cbd5e1"/>';
const _sunSm = '<circle cx="8.2" cy="7.6" r="3.1" fill="#fbbf24"/><g stroke="#fbbf24" stroke-width="1.3" stroke-linecap="round"><line x1="8.2" y1="1.8" x2="8.2" y2="3.2"/><line x1="2.4" y1="7.6" x2="3.8" y2="7.6"/><line x1="4.1" y1="3.5" x2="5.1" y2="4.5"/><line x1="12.3" y1="3.5" x2="11.3" y2="4.5"/></g>';
const _moonSm = '<path d="M13.2 7.7A4.5 4.5 0 1 1 7.8 3.1 3.5 3.5 0 0 0 13.2 7.7z" fill="#cbd5e1"/>';
const _cloud = c => `<path d="M7 18.5h9.4a3.6 3.6 0 0 0 .42-7.16 5.3 5.3 0 0 0-10.2-1.2A4 4 0 0 0 7 18.5z" fill="${c}"/>`;
const _rain = n => {
  const x = [8.5, 12, 15.5];
  let s = '<g stroke="#60a5fa" stroke-width="1.8" stroke-linecap="round">';
  for (let i = 0; i < n; i++) s += `<line x1="${x[i]}" y1="19.8" x2="${x[i] - 1}" y2="22.6"/>`;
  return s + '</g>';
};
const _snow = '<g fill="#e2e8f0"><circle cx="8.5" cy="20.9" r="1.15"/><circle cx="12" cy="22.1" r="1.15"/><circle cx="15.5" cy="20.9" r="1.15"/></g>';
const _bolt = '<polygon points="12.6,18.4 9.6,22.4 11.7,22.4 10.7,23.8 14,19.7 11.9,19.7 13.4,18.4" fill="#facc15"/>';
const _fog = '<g stroke="#9aa7b8" stroke-width="1.8" stroke-linecap="round"><line x1="4" y1="8" x2="20" y2="8"/><line x1="5.5" y1="12" x2="18.5" y2="12"/><line x1="4" y1="16" x2="17" y2="16"/><line x1="7" y1="20" x2="20" y2="20"/></g>';
const GRAY = '#94a3b8',
  DARK = '#6b7a8f';
function innerFor(c, night) {
  const n = !!night;
  if (c === 0) return n ? _moon : _sun;
  if (c === 1 || c === 2) return (n ? _moonSm : _sunSm) + _cloud(GRAY);
  if (c === 3) return _cloud(DARK);
  if (c === 45 || c === 48) return _fog;
  if (c >= 51 && c <= 57) return (n ? '' : _sunSm) + _cloud(GRAY) + _rain(2);
  if (c >= 61 && c <= 65) return _cloud(GRAY) + _rain(3);
  if (c === 66 || c === 67) return _cloud(GRAY) + _rain(2);
  if (c >= 71 && c <= 77) return _cloud(GRAY) + _snow;
  if (c >= 80 && c <= 82) return (n ? '' : _sunSm) + _cloud(GRAY) + _rain(3);
  if (c === 85 || c === 86) return (n ? '' : _sunSm) + _cloud(GRAY) + _snow;
  if (c >= 95) return _cloud(DARK) + _bolt;
  return _cloud(GRAY);
}

/**
 * WeatherIcon — the app's condition glyph, built by WMO weather code.
 * Sun/moon, cloud, rain streaks, snow, fog and thunder are layered
 * procedurally; `night` swaps sun→moon. Sizes to `size` (px).
 */
function WeatherIcon({
  code = 0,
  night = false,
  size = 26,
  style = {}
}) {
  if (code == null) return /*#__PURE__*/React.createElement("span", {
    style: {
      opacity: 0.4,
      ...style
    }
  }, "\u2013");
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    style: {
      display: 'inline-block',
      verticalAlign: '-0.18em',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.45))',
      ...style
    },
    dangerouslySetInnerHTML: {
      __html: innerFor(code, night)
    }
  });
}
Object.assign(__ds_scope, { WeatherIcon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/weather/WeatherIcon.jsx", error: String((e && e.message) || e) }); }

// components/weather/WeatherOrb.jsx
try { (() => {
const COL = {
  temp: '#7EE8A5',
  rain: '#5FA4FF',
  wind: '#A8E63E',
  cloud: '#C8A6FF'
};
const POS = {
  temp: [32, 20],
  rain: [44, 32],
  wind: [20, 32],
  cloud: [32, 44]
};
const DLY = {
  temp: 0,
  rain: 0.55,
  wind: 1.1,
  cloud: 1.65
};
const clamp01 = v => Math.max(0, Math.min(1, v));

/**
 * WeatherOrb — WeatherBlend's signature mark. Instead of a fixed weather
 * icon, four overlapping circles (mint=temp, blue=rain, lime=wind,
 * purple=cloud) grow and brighten with each metric's value; the strongest
 * glows. Screen-blended and gently breathing, every forecast gets its own
 * visual fingerprint. Pass raw values + ranges, or pre-normalised 0–1.
 */
function WeatherOrb({
  temp,
  rain = 0,
  wind = 0,
  cloud = 0,
  ranges = {
    tempMin: 0,
    tempMax: 40,
    windMax: 60,
    rainMax: 20
  },
  normalized = false,
  size = 64,
  animate = true,
  style = {}
}) {
  const str = normalized ? {
    temp: clamp01(temp),
    rain: clamp01(rain),
    wind: clamp01(wind),
    cloud: clamp01(cloud)
  } : {
    temp: clamp01(((temp ?? ranges.tempMin) - ranges.tempMin) / (ranges.tempMax - ranges.tempMin)),
    wind: clamp01(wind / ranges.windMax),
    rain: clamp01(Math.log1p(Math.max(0, rain)) / Math.log1p(ranges.rainMax)),
    cloud: clamp01(cloud / 100)
  };
  const vis = normalized ? {
    temp: true,
    rain: rain >= 0.02,
    wind: wind >= 0.02,
    cloud: cloud >= 0.02
  } : {
    temp: true,
    rain: rain >= 0.05,
    wind: wind >= 10,
    cloud: cloud >= 10
  };
  let strong = null,
    sv = 0.6;
  Object.keys(str).forEach(k => {
    if (vis[k] && str[k] > sv) {
      sv = str[k];
      strong = k;
    }
  });
  const R = s => (7 + s * 6).toFixed(1);
  const O = s => (0.34 + s * 0.6).toFixed(2);
  const order = ['wind', 'temp', 'rain', 'cloud'];
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: "0 0 64 64",
    width: size,
    height: size,
    style: {
      display: 'block',
      overflow: 'visible',
      filter: 'drop-shadow(0 2px 7px rgba(0,0,0,.4))',
      ...style
    }
  }, /*#__PURE__*/React.createElement("style", null, `@keyframes wbOrbBreathe{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}`), /*#__PURE__*/React.createElement("g", {
    style: {
      mixBlendMode: 'screen'
    }
  }, order.filter(k => vis[k]).map(k => /*#__PURE__*/React.createElement("circle", {
    key: k,
    cx: POS[k][0],
    cy: POS[k][1],
    r: R(str[k]),
    fill: COL[k],
    opacity: O(str[k]),
    style: {
      transformBox: 'fill-box',
      transformOrigin: 'center',
      animation: animate ? `wbOrbBreathe 4.6s ease-in-out infinite ${DLY[k]}s` : 'none',
      filter: strong === k ? `drop-shadow(0 0 3px ${COL[k]})` : undefined
    }
  }))));
}
Object.assign(__ds_scope, { WeatherOrb });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/weather/WeatherOrb.jsx", error: String((e && e.message) || e) }); }

// explorations/timelines-v2/app.jsx
try { (() => {
// App shell — chrome-less, whitespace-led. Header (no hero temperature:
// the streams ARE the identity), week overview, a zoom "lens" connector,
// the hourly streams, and the expandable secondary panel. The window tween
// and ambient clock live here so week / lens / streams stay in sync.
const zvEaseIO = window.WB_UI.easeIO;
function useWindowTween(target, ms = 650) {
  const [cur, setCur] = React.useState(target);
  const ref = React.useRef({
    raf: 0
  });
  React.useEffect(() => {
    const from = cur,
      t0 = performance.now();
    cancelAnimationFrame(ref.current.raf);
    const step = now => {
      const p = Math.min(1, (now - t0) / ms);
      setCur(from + (target - from) * zvEaseIO(p));
      if (p < 1) ref.current.raf = requestAnimationFrame(step);
    };
    ref.current.raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(ref.current.raf);
  }, [target]);
  return cur;
}
function useClock() {
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf,
      on = true;
    const loop = now => {
      if (!on) return;
      setT(now / 1000);
      raf = requestAnimationFrame(loop);
    };
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!mq.matches) raf = requestAnimationFrame(loop);
    return () => {
      on = false;
      cancelAnimationFrame(raf);
    };
  }, []);
  return t;
}

// The zoom lens — a soft trapezoid linking the selected day's slice of the
// week to the full-width day view, so the two read as one dataset at two
// scales. It tracks the same tween as the hourly window.
function ZoomLens({
  winStart
}) {
  const W = 400,
    H = 16,
    dayW = W / 7;
  const p = winStart / 24;
  const x1 = p * dayW,
    x2 = (p + 1) * dayW;
  return /*#__PURE__*/React.createElement("svg", {
    viewBox: '0 0 ' + W + ' ' + H,
    width: "100%",
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("polygon", {
    points: x1 + ',0 ' + x2 + ',0 ' + W + ',' + H + ' 0,' + H,
    fill: "rgba(77,141,240,.05)"
  }), /*#__PURE__*/React.createElement("line", {
    x1: x1,
    y1: "0",
    x2: "0",
    y2: H,
    stroke: "rgba(77,141,240,.30)",
    strokeWidth: "1"
  }), /*#__PURE__*/React.createElement("line", {
    x1: x2,
    y1: "0",
    x2: W,
    y2: H,
    stroke: "rgba(77,141,240,.30)",
    strokeWidth: "1"
  }));
}
function App() {
  const {
    Logo
  } = window.WeatherBlendDesignSystem_0cb5aa;
  const D = window.WB_DATA;
  const [sel, setSel] = React.useState(1);
  const winStart = useWindowTween(sel * 24);
  const clock = useClock();
  const day = D.days[sel];
  const isToday = sel === 1;
  const dates = ['Mar 3', 'Mar 4', 'Mar 5', 'Mar 6', 'Mar 7', 'Mar 8', 'Mar 9'];
  return /*#__PURE__*/React.createElement("div", {
    className: "phone"
  }, /*#__PURE__*/React.createElement("header", {
    style: {
      padding: '16px 18px 8px',
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }
  }, /*#__PURE__*/React.createElement(Logo, {
    size: 26
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 16,
      fontWeight: 700,
      letterSpacing: '-.2px'
    }
  }, "Orange NSW"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 10.5,
      color: 'var(--wb-text-dim)',
      fontWeight: 600,
      letterSpacing: '1px',
      textTransform: 'uppercase',
      marginTop: 1
    }
  }, isToday ? 'Today' : day.dow, " \xB7 ", dates[sel], " \xB7 7-model blend"))), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1,
      overflowY: 'auto',
      padding: '8px 15px 26px'
    }
  }, /*#__PURE__*/React.createElement(window.WeekStreams, {
    sel: sel,
    onSel: setSel,
    clock: clock
  }), /*#__PURE__*/React.createElement(ZoomLens, {
    winStart: winStart
  }), /*#__PURE__*/React.createElement(window.HourlyStreams, {
    sel: sel,
    winStart: winStart,
    clock: clock
  }), /*#__PURE__*/React.createElement(window.SecondaryPanel, {
    sel: sel
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11,
      color: 'var(--wb-text-dim)',
      lineHeight: 1.55,
      padding: '12px 2px 0',
      borderTop: '1px solid var(--wb-border)'
    }
  }, "The week above and the day below are one continuous stream \u2014 tap a day and the view glides along it. Glow softness, ribbon width and bar haze show model disagreement; crisp means the seven models agree. Lines dim where it is night.")));
}
if (window.WB_DATA && window.WeatherBlendDesignSystem_0cb5aa && document.getElementById('root')) {
  ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
}
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/timelines-v2/app.jsx", error: String((e && e.message) || e) }); }

// explorations/timelines-v2/panel.jsx
try { (() => {
// SecondaryPanel — expandable strip of supporting metrics. Collapsed it is
// a single quiet row; expanded it reveals small sparklines in the same
// visual style (soft glow line) but in a neutral tone so they never
// compete with the four primary streams.
function SecondaryPanel({
  sel
}) {
  const S = window.WB_STREAMS,
    U = window.WB_UI;
  const [open, setOpen] = React.useState(false);
  if (!S) return null;
  const sec = S.secondary;
  const isToday = sel === 1;
  const refH = isToday ? S.NOW : sel * 24 + 13;
  const items = [{
    k: 'uv',
    label: 'UV index',
    val: sec.uv[refH].toFixed(0)
  }, {
    k: 'hum',
    label: 'Humidity',
    val: sec.hum[refH] + '%'
  }, {
    k: 'pres',
    label: 'Pressure',
    val: Math.round(sec.pres[refH]) + ' hPa'
  }, {
    k: 'vis',
    label: 'Visibility',
    val: sec.vis[refH].toFixed(0) + ' km'
  }, {
    k: 'dew',
    label: 'Dew point',
    val: Math.round(sec.dew[refH]) + '°'
  }, {
    k: 'aqi',
    label: 'Air quality',
    val: sec.aqi[refH] + ' good'
  }];
  function Spark({
    vals
  }) {
    const W = 170,
      H = 26;
    const mn = Math.min(...vals),
      mx = Math.max(...vals);
    const pts = vals.map((v, i) => [i / (vals.length - 1) * W, H - 3 - (v - mn) / (mx - mn || 1) * (H - 6)]);
    const d = U.smoothPath(pts);
    return /*#__PURE__*/React.createElement("svg", {
      viewBox: '0 0 ' + W + ' ' + H,
      width: "100%",
      height: H,
      style: {
        display: 'block'
      }
    }, /*#__PURE__*/React.createElement("path", {
      d: d,
      fill: "none",
      stroke: "var(--wb-text-muted)",
      strokeWidth: "3.5",
      opacity: "0.12"
    }), /*#__PURE__*/React.createElement("path", {
      d: d,
      fill: "none",
      stroke: "var(--wb-text-muted)",
      strokeWidth: "1.2",
      strokeLinecap: "round",
      opacity: "0.8"
    }));
  }
  const dayVals = arr => Array.from({
    length: 24
  }, (_, h) => arr[sel * 24 + h]);
  return /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setOpen(!open),
    style: {
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      background: 'none',
      border: 'none',
      borderTop: '1px solid var(--wb-border)',
      padding: '13px 2px 12px',
      cursor: 'pointer',
      color: 'var(--wb-text-dim)',
      fontFamily: 'inherit'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '1.2px',
      textTransform: 'uppercase'
    }
  }, "Secondary metrics"), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      display: 'flex',
      transition: 'transform .3s',
      transform: open ? 'rotate(180deg)' : 'none'
    }
  }, /*#__PURE__*/React.createElement("svg", {
    width: "14",
    height: "14",
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: "2",
    strokeLinecap: "round",
    strokeLinejoin: "round"
  }, /*#__PURE__*/React.createElement("path", {
    d: "M6 9l6 6 6-6"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      overflow: 'hidden',
      maxHeight: open ? 320 : 0,
      opacity: open ? 1 : 0,
      transition: 'max-height .45s cubic-bezier(.4,0,.2,1), opacity .35s'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '16px 22px',
      padding: '2px 2px 14px'
    }
  }, items.map(it => /*#__PURE__*/React.createElement("div", {
    key: it.k,
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 5
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      alignItems: 'baseline',
      gap: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 9.5,
      fontWeight: 700,
      letterSpacing: '.8px',
      textTransform: 'uppercase',
      color: 'var(--wb-text-dim)'
    }
  }, it.label), /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 12.5,
      fontWeight: 600,
      color: 'var(--wb-text-muted)'
    }
  }, it.val)), /*#__PURE__*/React.createElement(Spark, {
    vals: dayVals(sec[it.k])
  }))))));
}
window.SecondaryPanel = SecondaryPanel;
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/timelines-v2/panel.jsx", error: String((e && e.message) || e) }); }

// explorations/timelines-v2/streams.jsx
try { (() => {
// HourlyStreams — the zoomed-in day view. Four lanes share one SVG and one
// time axis; the 24h window is a slice of the 168h stream and TWEENS along
// it (winStart is animated by the app shell). Each lane's identity:
//   Temp  — glowing line; ribbon width + glow softness = model spread
//   Rain  — accumulation bars; opacity/echo = confidence
//   Wind  — true oscillating ripple around a mid-lane baseline
//   Cloud — constant-width ribbon, opacity = cover
// Daylight is carried by the DATA (a luminance mask dims the lines at
// night); the background stays stable. Metric headers (icon + values) sit
// above each lane as HTML overlays.
function HourlyStreams({
  sel,
  winStart,
  clock
}) {
  const S = window.WB_STREAMS,
    D = window.WB_DATA,
    U = window.WB_UI;
  const {
    MetricIcon
  } = window.WeatherBlendDesignSystem_0cb5aa;
  if (!S || !D) return null;
  const W = 400,
    LANE = 82,
    GAP = 48,
    TOP = 42,
    AXIS = 30;
  const lanes = ['temp', 'rain', 'wind', 'cloud'];
  const TOTALH = TOP + lanes.length * LANE + (lanes.length - 1) * GAP + AXIS;
  const laneY = i => TOP + i * (LANE + GAP);
  const H2X = h => (h - winStart) / 24 * W;
  const visible = [];
  for (let h = Math.floor(winStart) - 1; h <= Math.ceil(winStart) + 25; h++) if (h >= 0 && h < S.HOURS) visible.push(h);

  // week-wide scales so sliding never rescales
  const sc = {
    temp: [Math.min(...S.temp) - 1, Math.max(...S.temp) + 1],
    rain: [0, Math.max(1.2, Math.max(...S.rain) * 1.1)],
    wind: [0, Math.max(...S.wind) * 1.15]
  };
  const Y = (m, v, y0) => y0 + LANE - (v - sc[m][0]) / (sc[m][1] - sc[m][0]) * LANE;
  const spreadAt = h => S.spread[Math.max(0, Math.min(S.HOURS - 1, h))];
  const meanSpread = visible.reduce((a, h) => a + spreadAt(h), 0) / visible.length;
  const isToday = sel === 1;
  const day = D.days[sel];
  const dayHours = Array.from({
    length: 24
  }, (_, i) => sel * 24 + i);
  const refH = isToday ? S.NOW : sel * 24 + 13;

  // ── temp lane ──
  const y0t = laneY(0);
  const tempPts = visible.map(h => [H2X(h), Y('temp', S.temp[h], y0t)]);
  const ribbonW = 3 + meanSpread * 13;
  const glowW = 10 + meanSpread * 22;
  const glowPulse = 0.5 + 0.18 * Math.sin(clock * 1.1);
  let hiH = dayHours[0],
    loH = dayHours[0];
  dayHours.forEach(h => {
    if (S.temp[h] > S.temp[hiH]) hiH = h;
    if (S.temp[h] < S.temp[loH]) loH = h;
  });

  // ── rain lane ──
  const y0r = laneY(1);
  const barW = W / 24 * 0.42;
  const rainConf = day.conf.rain;
  const dayRain = +dayHours.reduce((a, h) => a + S.rain[h], 0).toFixed(1);
  const rainToCome = isToday ? +dayHours.filter(h => h >= S.NOW).reduce((a, h) => a + S.rain[h], 0).toFixed(1) : sel < 1 ? 0 : dayRain;

  // ── wind lane: oscillating ripple centred on a baseline ──
  const y0w = laneY(2);
  const windBase = y0w + LANE * 0.5;
  const windPath = off => {
    let d = '';
    for (let px = 0; px <= W; px += 4) {
      const h = winStart + px / W * 24;
      const hi = Math.max(0, Math.min(S.HOURS - 1, Math.floor(h)));
      const sp = S.wind[hi],
        gu = S.gust[hi];
      const amp = 1.4 + sp / sc.wind[1] * 14 + (gu - sp) / sc.wind[1] * 12;
      const y = windBase + Math.sin(px * 0.10 + clock * 2.3 + off) * amp * 0.55 + Math.sin(px * 0.026 - clock * 1.2 + off * 2.1) * amp * 0.45;
      d += (px ? 'L' : 'M') + px + ' ' + y.toFixed(1);
    }
    return d;
  };
  const windMean = Math.round(visible.reduce((a, h) => a + S.wind[h], 0) / visible.length);
  const windCoreW = 1.2 + windMean / sc.wind[1] * 3.2;
  const windHi = Math.max(...dayHours.map(h => S.wind[h]));
  const windLo = Math.min(...dayHours.map(h => S.wind[h]));

  // ── cloud lane ──
  const y0c = laneY(3);
  const cloudStops = visible.map(h => {
    const x = Math.max(0, Math.min(1, H2X(h) / W));
    return '<stop offset="' + (x * 100).toFixed(1) + '%" stop-color="' + U.COL.cloud + '" stop-opacity="' + (0.03 + Math.pow(S.cloud[h] / 100, 1.15) * 0.85).toFixed(2) + '"/>';
  }).join('');
  const cloudHi = Math.max(...dayHours.map(h => S.cloud[h]));
  const cloudLo = Math.min(...dayHours.map(h => S.cloud[h]));

  // ── daylight luminance mask: the lines carry day/night, not the bg ──
  const lumStops = visible.map(h => {
    const x = Math.max(0, Math.min(1, H2X(h) / W));
    return '<stop offset="' + (x * 100).toFixed(1) + '%" stop-color="#fff" stop-opacity="' + U.lum(h).toFixed(2) + '"/>';
  }).join('');

  // sunrise/sunset markers (icons only, no time labels)
  const suns = [];
  D.days.forEach((d, di) => {
    suns.push({
      h: di * 24 + d.rise * 23,
      kind: 'rise'
    }, {
      h: di * 24 + d.set * 23,
      kind: 'set'
    });
  });

  // ── headers (HTML overlay) ──
  const headers = [{
    m: 'temp',
    primary: Math.round(S.temp[refH]) + '°',
    secondary: 'feels ' + Math.round(S.feels[refH]) + '°',
    right: null
  }, {
    m: 'rain',
    primary: dayRain.toFixed(1) + ' mm',
    secondary: isToday ? rainToCome.toFixed(1) + ' mm to come' : sel < 1 ? 'observed' : 'expected',
    right: rainConf + '% conf'
  }, {
    m: 'wind',
    primary: S.wind[refH] + ' km/h',
    secondary: day.windDir,
    right: '↑' + windHi + ' ↓' + windLo
  }, {
    m: 'cloud',
    primary: S.cloud[refH] + '%',
    secondary: 'cover',
    right: '↑' + cloudHi + ' ↓' + cloudLo
  }];
  const NAME = {
    temp: 'Temp',
    rain: 'Rain',
    wind: 'Wind',
    cloud: 'Cloud'
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative'
    }
  }, headers.map((hd, i) => /*#__PURE__*/React.createElement("div", {
    key: hd.m,
    style: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: (laneY(i) - 34) / TOTALH * 100 + '%',
      display: 'flex',
      alignItems: 'baseline',
      gap: 8,
      pointerEvents: 'none'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      alignSelf: 'center',
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(MetricIcon, {
    metric: hd.m,
    size: 15
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '1.2px',
      textTransform: 'uppercase',
      color: U.COL[hd.m]
    }
  }, NAME[hd.m]), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 17,
      fontWeight: 700,
      letterSpacing: '-.3px',
      color: 'var(--wb-text)'
    }
  }, hd.primary), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      fontWeight: 600,
      color: 'var(--wb-text-dim)'
    }
  }, hd.secondary), hd.right && /*#__PURE__*/React.createElement("span", {
    style: {
      marginLeft: 'auto',
      fontSize: 10,
      fontWeight: 600,
      color: 'var(--wb-text-dim)',
      fontFamily: 'var(--wb-font-mono)'
    }
  }, hd.right))), /*#__PURE__*/React.createElement("svg", {
    viewBox: '0 0 ' + W + ' ' + TOTALH,
    width: "100%",
    style: {
      display: 'block',
      overflow: 'hidden'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "stCloud",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0",
    dangerouslySetInnerHTML: {
      __html: cloudStops
    }
  }), /*#__PURE__*/React.createElement("linearGradient", {
    id: "stLum",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0",
    dangerouslySetInnerHTML: {
      __html: lumStops
    }
  }), /*#__PURE__*/React.createElement("mask", {
    id: "stNight"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "0",
    width: W,
    height: TOTALH,
    fill: "url(#stLum)"
  })), /*#__PURE__*/React.createElement("filter", {
    id: "stSoft",
    x: "-40%",
    y: "-40%",
    width: "180%",
    height: "180%"
  }, /*#__PURE__*/React.createElement("feGaussianBlur", {
    stdDeviation: 2 + meanSpread * 3
  })), /*#__PURE__*/React.createElement("filter", {
    id: "stEcho",
    x: "-40%",
    y: "-40%",
    width: "180%",
    height: "180%"
  }, /*#__PURE__*/React.createElement("feGaussianBlur", {
    stdDeviation: "2.6"
  })), /*#__PURE__*/React.createElement("filter", {
    id: "stGlowNow",
    x: "-300%",
    y: "-5%",
    width: "700%",
    height: "110%"
  }, /*#__PURE__*/React.createElement("feGaussianBlur", {
    stdDeviation: "2.4"
  }))), /*#__PURE__*/React.createElement("g", {
    mask: "url(#stNight)"
  }, /*#__PURE__*/React.createElement("path", {
    d: U.smoothPath(tempPts),
    fill: "none",
    stroke: U.COL.temp,
    strokeWidth: glowW,
    strokeLinecap: "round",
    opacity: 0.10 * glowPulse * 2,
    filter: "url(#stSoft)"
  }), /*#__PURE__*/React.createElement("path", {
    d: U.smoothPath(tempPts),
    fill: "none",
    stroke: U.COL.temp,
    strokeWidth: ribbonW,
    strokeLinecap: "round",
    opacity: "0.16"
  }), /*#__PURE__*/React.createElement("path", {
    d: U.smoothPath(tempPts),
    fill: "none",
    stroke: U.COL.temp,
    strokeWidth: "2",
    strokeLinecap: "round",
    opacity: "0.95"
  }), [hiH, loH].map((h, i) => {
    const x = H2X(h);
    if (x < -10 || x > W + 10) return null;
    const y = Y('temp', S.temp[h], y0t);
    return /*#__PURE__*/React.createElement("g", {
      key: i
    }, /*#__PURE__*/React.createElement("circle", {
      cx: x,
      cy: y,
      r: "3",
      fill: "var(--wb-bg)",
      stroke: U.COL.temp,
      strokeWidth: "1.6"
    }), /*#__PURE__*/React.createElement("text", {
      x: x,
      y: y + (i ? 16 : -9),
      textAnchor: "middle",
      fill: "var(--wb-text-muted)",
      style: {
        fontSize: 10.5,
        fontWeight: 700
      }
    }, Math.round(S.temp[h]), "\xB0"));
  }), /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: y0r + LANE,
    x2: W,
    y2: y0r + LANE,
    stroke: "var(--wb-border)",
    strokeWidth: "1"
  }), meanSpread > 0.25 && visible.map(h => {
    const v = S.rain[h];
    if (v < 0.03) return null;
    const x = H2X(h),
      bh = Math.max(2.5, v / sc.rain[1] * LANE);
    return /*#__PURE__*/React.createElement("rect", {
      key: 'e' + h,
      x: x - barW / 2 - 1.5,
      y: y0r + LANE - bh - 1.5,
      width: barW + 3,
      height: bh + 1.5,
      rx: barW / 2,
      fill: U.COL.rain,
      opacity: meanSpread * 0.35,
      filter: "url(#stEcho)"
    });
  }), visible.map(h => {
    const v = S.rain[h];
    if (v < 0.03) return null;
    const x = H2X(h),
      bh = Math.max(2.5, v / sc.rain[1] * LANE);
    return /*#__PURE__*/React.createElement("rect", {
      key: h,
      x: x - barW / 2,
      y: y0r + LANE - bh,
      width: barW,
      height: bh,
      rx: barW / 2,
      fill: U.COL.rain,
      opacity: 0.35 + rainConf / 100 * 0.45 + Math.min(0.2, v / 4),
      style: {
        transition: 'opacity .6s'
      }
    });
  }), /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: windBase,
    x2: W,
    y2: windBase,
    stroke: "var(--wb-border)",
    strokeWidth: "1",
    strokeDasharray: "2 4",
    opacity: "0.6"
  }), /*#__PURE__*/React.createElement("path", {
    d: windPath(0),
    fill: "none",
    stroke: U.COL.wind,
    strokeWidth: windCoreW * 2.6,
    opacity: "0.10",
    filter: "url(#stEcho)"
  }), /*#__PURE__*/React.createElement("path", {
    d: windPath(1.7),
    fill: "none",
    stroke: U.COL.wind,
    strokeWidth: windCoreW * 0.5,
    opacity: "0.25"
  }), /*#__PURE__*/React.createElement("path", {
    d: windPath(0),
    fill: "none",
    stroke: U.COL.wind,
    strokeWidth: windCoreW,
    strokeLinecap: "round",
    opacity: "0.85"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: y0c + LANE * 0.30,
    width: W,
    height: LANE * 0.40,
    rx: LANE * 0.20,
    fill: "url(#stCloud)"
  })), [0, 6, 12, 18, 24].map(hh => {
    const x = H2X(Math.round(winStart) + hh);
    return /*#__PURE__*/React.createElement("text", {
      key: hh,
      x: Math.max(10, Math.min(W - 10, x)),
      y: TOTALH - 8,
      textAnchor: "middle",
      fill: "var(--wb-text-dim)",
      style: {
        fontSize: 10,
        fontWeight: 600,
        fontFamily: 'var(--wb-font-mono)'
      }
    }, U.fmtHr(winStart + hh));
  }), suns.map((s, i) => {
    const x = H2X(s.h);
    if (x < 4 || x > W - 4) return null;
    const y = TOTALH - AXIS + 5;
    return /*#__PURE__*/React.createElement("g", {
      key: i,
      stroke: "var(--wb-sun)",
      strokeWidth: "1.3",
      strokeLinecap: "round",
      fill: "none",
      opacity: "0.55"
    }, /*#__PURE__*/React.createElement("circle", {
      cx: x,
      cy: y + 3,
      r: "2.4"
    }), /*#__PURE__*/React.createElement("line", {
      x1: x - 5,
      y1: y + 7,
      x2: x + 5,
      y2: y + 7
    }), /*#__PURE__*/React.createElement("path", {
      d: s.kind === 'rise' ? 'M ' + (x - 2.4) + ' ' + (y - 3) + ' L ' + x + ' ' + (y - 5.6) + ' L ' + (x + 2.4) + ' ' + (y - 3) : 'M ' + (x - 2.4) + ' ' + (y - 5.6) + ' L ' + x + ' ' + (y - 3) + ' L ' + (x + 2.4) + ' ' + (y - 5.6)
    }));
  }), (() => {
    const x = H2X(S.NOW);
    if (x < -6 || x > W + 6) return null;
    return /*#__PURE__*/React.createElement("g", null, /*#__PURE__*/React.createElement("line", {
      x1: x,
      y1: "6",
      x2: x,
      y2: TOTALH - AXIS + 10,
      stroke: "var(--wb-now)",
      strokeWidth: "5",
      opacity: 0.25 + 0.12 * Math.sin(clock * 1.4),
      filter: "url(#stGlowNow)"
    }), /*#__PURE__*/React.createElement("line", {
      x1: x,
      y1: "6",
      x2: x,
      y2: TOTALH - AXIS + 10,
      stroke: "var(--wb-now)",
      strokeWidth: "1.3",
      opacity: "0.9"
    }), /*#__PURE__*/React.createElement("text", {
      x: x,
      y: "1",
      textAnchor: "middle",
      dominantBaseline: "hanging",
      fill: "var(--wb-now)",
      style: {
        fontSize: 8.5,
        fontWeight: 800,
        letterSpacing: '1px'
      }
    }, "NOW"));
  })()));
}
window.HourlyStreams = HourlyStreams;
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/timelines-v2/streams.jsx", error: String((e && e.message) || e) }); }

// explorations/timelines-v2/week.jsx
try { (() => {
// WeekStreams — the 7-day overview drawn in the SAME visual language as the
// hourly view: glowing temp line, rain bars, oscillating wind ripple, cloud
// opacity ribbon. It is the zoomed-out end of one continuous timeline.
function WeekStreams({
  sel,
  onSel,
  clock
}) {
  const S = window.WB_STREAMS,
    D = window.WB_DATA,
    U = window.WB_UI;
  if (!S || !D) return null;
  const W = 400,
    N = S.HOURS,
    dayW = W / 7;
  const X = h => h / (N - 1) * W;

  // lane geometry
  const yT = 4,
    hT = 30; // temp line
  const yR = 42,
    hR = 20; // rain bars
  const yW = 68,
    hW = 24; // wind ripple
  const yC = 98,
    hC = 12; // cloud ribbon
  const H = 114;
  const tMin = Math.min(...S.temp) - 1,
    tMax = Math.max(...S.temp) + 1;
  const rMax = Math.max(1, Math.max(...S.rain));
  const wMax = Math.max(...S.wind);

  // temp — glowing line, sampled every 2h
  const tempPts = [];
  for (let h = 0; h < N; h += 2) tempPts.push([X(h), yT + hT - (S.temp[h] - tMin) / (tMax - tMin) * hT]);
  const tempD = U.smoothPath(tempPts);

  // rain — 3h bins → bars
  const bins = [];
  for (let b = 0; b < 56; b++) {
    let v = 0;
    for (let k = 0; k < 3; k++) v += S.rain[b * 3 + k] || 0;
    if (v > 0.05) bins.push([b, v]);
  }
  const binMax = Math.max(1.2, ...bins.map(b => b[1]));

  // wind — small oscillating ripple around a mid-lane baseline
  const wBase = yW + hW / 2;
  const windD = (() => {
    let d = '';
    for (let px = 0; px <= W; px += 3) {
      const h = Math.min(N - 1, Math.floor(px / W * N));
      const amp = 0.7 + S.wind[h] / wMax * 5.2;
      const y = wBase + Math.sin(px * 0.16 + clock * 1.6) * amp * 0.55 + Math.sin(px * 0.041 - clock * 0.8) * amp * 0.45;
      d += (px ? 'L' : 'M') + px + ' ' + y.toFixed(1);
    }
    return d;
  })();

  // cloud — opacity gradient stops every 3h
  const cloudStops = [];
  for (let h = 0; h < N; h += 3) {
    cloudStops.push('<stop offset="' + (h / (N - 1) * 100).toFixed(1) + '%" stop-color="' + U.COL.cloud + '" stop-opacity="' + (0.04 + Math.pow(S.cloud[h] / 100, 1.2) * 0.8).toFixed(2) + '"/>');
  }

  // night dimming as a luminance mask, sampled every 2h
  const lumStops = [];
  for (let h = 0; h < N; h += 2) {
    const l = 0.5 + 0.5 * ((U.lum(h) - 0.30) / 0.70);
    lumStops.push('<stop offset="' + (h / (N - 1) * 100).toFixed(1) + '%" stop-color="#fff" stop-opacity="' + l.toFixed(2) + '"/>');
  }
  const nowX = S.NOW / (N - 1) * W;
  const click = e => {
    const r = e.currentTarget.getBoundingClientRect();
    onSel(Math.max(0, Math.min(6, Math.floor((e.clientX - r.left) / r.width * 7))));
  };
  return /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      cursor: 'pointer',
      userSelect: 'none'
    },
    onClick: click
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(7,1fr)',
      padding: '0 0 3px'
    }
  }, D.days.map((d, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    style: {
      textAlign: 'center',
      fontSize: 10,
      fontWeight: i === sel ? 800 : 600,
      letterSpacing: '.6px',
      textTransform: 'uppercase',
      color: i === sel ? 'var(--wb-text)' : i === 1 ? 'var(--wb-text-muted)' : 'var(--wb-text-dim)',
      transition: 'color .3s'
    }
  }, d.dow, i === 1 && /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--wb-accent)'
    }
  }, " \u2022")))), /*#__PURE__*/React.createElement("svg", {
    viewBox: '0 0 ' + W + ' ' + H,
    width: "100%",
    style: {
      display: 'block'
    }
  }, /*#__PURE__*/React.createElement("defs", null, /*#__PURE__*/React.createElement("linearGradient", {
    id: "wkFade",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0"
  }, /*#__PURE__*/React.createElement("stop", {
    offset: "0",
    stopColor: "#fff",
    stopOpacity: "0"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "0.04",
    stopColor: "#fff",
    stopOpacity: "1"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "0.96",
    stopColor: "#fff",
    stopOpacity: "1"
  }), /*#__PURE__*/React.createElement("stop", {
    offset: "1",
    stopColor: "#fff",
    stopOpacity: "0"
  })), /*#__PURE__*/React.createElement("linearGradient", {
    id: "wkLum",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0",
    dangerouslySetInnerHTML: {
      __html: lumStops.join('')
    }
  }), /*#__PURE__*/React.createElement("linearGradient", {
    id: "wkCloud",
    x1: "0",
    y1: "0",
    x2: "1",
    y2: "0",
    dangerouslySetInnerHTML: {
      __html: cloudStops.join('')
    }
  }), /*#__PURE__*/React.createElement("mask", {
    id: "wkMask"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "0",
    width: W,
    height: H,
    fill: "url(#wkFade)"
  })), /*#__PURE__*/React.createElement("mask", {
    id: "wkNight"
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "0",
    width: W,
    height: H,
    fill: "url(#wkLum)"
  })), /*#__PURE__*/React.createElement("filter", {
    id: "wkGlow",
    x: "-20%",
    y: "-40%",
    width: "140%",
    height: "180%"
  }, /*#__PURE__*/React.createElement("feGaussianBlur", {
    stdDeviation: "1.8"
  }))), /*#__PURE__*/React.createElement("g", {
    style: {
      transform: 'translateX(' + sel * dayW + 'px)',
      transition: 'transform .55s cubic-bezier(.4,0,.2,1)'
    }
  }, /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "0",
    width: dayW,
    height: H,
    rx: "5",
    fill: "rgba(77,141,240,.07)",
    stroke: "rgba(77,141,240,.30)",
    strokeWidth: "1"
  })), /*#__PURE__*/React.createElement("g", {
    mask: "url(#wkMask)"
  }, /*#__PURE__*/React.createElement("g", {
    mask: "url(#wkNight)"
  }, /*#__PURE__*/React.createElement("path", {
    d: tempD,
    fill: "none",
    stroke: U.COL.temp,
    strokeWidth: "4.5",
    opacity: "0.16",
    filter: "url(#wkGlow)"
  }), /*#__PURE__*/React.createElement("path", {
    d: tempD,
    fill: "none",
    stroke: U.COL.temp,
    strokeWidth: "1.3",
    strokeLinecap: "round",
    opacity: "0.9"
  }), /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: yR + hR,
    x2: W,
    y2: yR + hR,
    stroke: "var(--wb-border)",
    strokeWidth: "1",
    opacity: "0.7"
  }), bins.map(([b, v]) => {
    const bh = Math.max(1.6, v / binMax * hR);
    return /*#__PURE__*/React.createElement("rect", {
      key: b,
      x: b / 56 * W + 1.2,
      y: yR + hR - bh,
      width: "3.4",
      height: bh,
      rx: "1.7",
      fill: U.COL.rain,
      opacity: 0.45 + Math.min(0.45, v / 4)
    });
  }), /*#__PURE__*/React.createElement("line", {
    x1: "0",
    y1: wBase,
    x2: W,
    y2: wBase,
    stroke: "var(--wb-border)",
    strokeWidth: "1",
    strokeDasharray: "2 4",
    opacity: "0.5"
  }), /*#__PURE__*/React.createElement("path", {
    d: windD,
    fill: "none",
    stroke: U.COL.wind,
    strokeWidth: "1.1",
    strokeLinecap: "round",
    opacity: "0.8"
  }), /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: yC,
    width: W,
    height: hC,
    rx: hC / 2,
    fill: "url(#wkCloud)"
  })), /*#__PURE__*/React.createElement("rect", {
    x: "0",
    y: "0",
    width: nowX,
    height: H,
    fill: "rgba(12,15,21,.5)"
  })), Array.from({
    length: 6
  }, (_, i) => /*#__PURE__*/React.createElement("line", {
    key: i,
    x1: (i + 1) * dayW,
    y1: "0",
    x2: (i + 1) * dayW,
    y2: H,
    stroke: "var(--wb-border)",
    strokeWidth: "1",
    opacity: "0.55"
  })), /*#__PURE__*/React.createElement("line", {
    x1: nowX,
    y1: "-2",
    x2: nowX,
    y2: H + 2,
    stroke: "var(--wb-now)",
    strokeWidth: "1.2",
    opacity: "0.8"
  })));
}
window.WeekStreams = WeekStreams;
})(); } catch (e) { __ds_ns.__errors.push({ path: "explorations/timelines-v2/week.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Logo = __ds_scope.Logo;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Segment = __ds_scope.Segment;

__ds_ns.Toggle = __ds_scope.Toggle;

__ds_ns.ConfidenceTag = __ds_scope.ConfidenceTag;

__ds_ns.MetricCard = __ds_scope.MetricCard;

__ds_ns.MODELS = __ds_scope.MODELS;

__ds_ns.ModelBadge = __ds_scope.ModelBadge;

__ds_ns.WeightBadge = __ds_scope.WeightBadge;

__ds_ns.ModelToggle = __ds_scope.ModelToggle;

__ds_ns.Modal = __ds_scope.Modal;

__ds_ns.BottomNav = __ds_scope.BottomNav;

__ds_ns.Drawer = __ds_scope.Drawer;

__ds_ns.DayTile = __ds_scope.DayTile;

__ds_ns.MetricIcon = __ds_scope.MetricIcon;

__ds_ns.Sparkline = __ds_scope.Sparkline;

__ds_ns.WeatherIcon = __ds_scope.WeatherIcon;

__ds_ns.WeatherOrb = __ds_scope.WeatherOrb;

})();
