# Claude Instructions for Drawer Project

## Design System - CRITICAL

**BEFORE making ANY styling changes, you MUST:**

1. Check `tailwind.config.ts` for existing design tokens
2. Check `DESIGN_TOKENS.md` for documentation
3. Use Tailwind classes from the config instead of inline styles whenever possible

### Design Token Files (CHECK THESE FIRST):
- `tailwind.config.ts` - All color, spacing, typography tokens
- `DESIGN_TOKENS.md` - Token documentation and usage guidelines

### Common Mistakes to Avoid:
- ❌ Using inline `style={{ color: '#1A1A1A' }}` when `text-bg-main` exists
- ❌ Using inline `style={{ color: '#F5F5F5' }}` when `text-text-main` exists
- ❌ Using inline `style={{ fontSize: '12px' }}` when `text-xs` exists
- ❌ Using inline `style={{ fontSize: '14px' }}` when `text-sm` exists
- ❌ Using inline `style={{ fontSize: '16px' }}` when `text-base` exists

### Correct Approach:
- ✅ Use `text-text-main` for #F5F5F5 (light text)
- ✅ Use `text-bg-main` for #1A1A1A (dark text, despite the name "bg")
- ✅ Use `text-text-secondary` for #8C8C8C (muted text)
- ✅ Use `text-xs`, `text-sm`, `text-base` for 12px, 14px, 16px
- ✅ Use `bg-bg-main`, `bg-bg-elevated` for backgrounds
- ✅ Use `border-divider` for borders

## File Organization

### When to Use CSS Modules vs Tailwind:
- **CSS Modules** (`.module.css`): Animations, transitions, complex interactions, `-webkit-` prefixes
- **Tailwind Classes**: Colors, spacing, typography, layout, simple styles

### Architecture Patterns:
- **State Management**: Zustand store in `src/store/`
- **Storage**: Abstraction layer in `src/shared/storage.ts` (supports both localStorage and browser.storage)
- **Types**: All interfaces in `src/shared/types.ts`
- **Components**: React components in `src/components/`

## Code Style

- Always prefer editing existing files over creating new ones
- Keep solutions simple, avoid over-engineering
- Use existing patterns from the codebase
- Font weight default is 300 (light)
- All spacing should be even numbers (4px, 8px, 16px, etc.)

## Testing

- Use `npm run dev` to start the test page
