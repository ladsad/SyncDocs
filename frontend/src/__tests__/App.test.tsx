import { render, screen } from '@testing-library/react';
import App from '../App';

test('renders SyncDocs title', () => {
  render(<App />);
  const titleElement = screen.getByText(/SyncDocs/i);
  expect(titleElement).toBeInTheDocument();
});
