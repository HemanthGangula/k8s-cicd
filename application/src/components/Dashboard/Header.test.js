import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';
import Logout from '../Logout';

jest.mock('../Logout', () => ({ setIsAuthenticated }) => (
  <button onClick={() => setIsAuthenticated(false)}>Logout</button>
));

describe('Header Component', () => {
  const mockSetIsAdding = jest.fn();
  const mockSetIsAuthenticated = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders Header component correctly', () => {
    render(
      <Header
        setIsAdding={mockSetIsAdding}
        setIsAuthenticated={mockSetIsAuthenticated}
      />
    );

    expect(
      screen.getByText('Employee Management Software')
    ).toBeInTheDocument();
    expect(screen.getByText('Add Employee')).toBeInTheDocument();
    expect(screen.getByText('Logout')).toBeInTheDocument();
  });

  test('calls setIsAdding(true) when Add Employee button is clicked', () => {
    render(
      <Header
        setIsAdding={mockSetIsAdding}
        setIsAuthenticated={mockSetIsAuthenticated}
      />
    );

    fireEvent.click(screen.getByText('Add Employee'));

    expect(mockSetIsAdding).toHaveBeenCalledWith(true);
  });

  test('renders Logout component and handles logout', () => {
    render(
      <Header
        setIsAdding={mockSetIsAdding}
        setIsAuthenticated={mockSetIsAuthenticated}
      />
    );

    fireEvent.click(screen.getByText('Logout'));

    expect(mockSetIsAuthenticated).toHaveBeenCalledWith(false);
  });
});