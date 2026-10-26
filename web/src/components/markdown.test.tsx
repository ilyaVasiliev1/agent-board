import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Markdown } from './markdown';

describe('Markdown', () => {
  it('ввод остаётся текстом: теги не превращаются в элементы', () => {
    const { container } = render(<Markdown source={'<img src=x onerror=alert(1)>\n**важно**'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument();
    expect(screen.getByText('важно').tagName).toBe('STRONG');
  });

  it('ссылки открываются в новой вкладке без передачи opener', () => {
    render(<Markdown source="[сайт](https://example.test)" />);
    const link = screen.getByRole('link', { name: 'сайт' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });
});
