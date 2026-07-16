import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Table from './Table';

describe('Table Component', () => {
  const mockHandleEdit = jest.fn();
  const mockHandleDelete = jest.fn();

  const mockEmployees = [
    {
      id: 1,
      firstName: 'John',
      lastName: 'Doe',
      email: 'john.doe@example.com',
      salary: 50000,
      date: '2025-04-17',
    },
    {
      id: 2,
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane.smith@example.com',
      salary: 60000,
      date: '2025-04-18',
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders table with employees', () => {
    render(
      <Table
        employees={mockEmployees}
        handleEdit={mockHandleEdit}
        handleDelete={mockHandleDelete}
      />
    );

    expect(screen.getByText('John')).toBeInTheDocument();
    expect(screen.getByText('Doe')).toBeInTheDocument();
    expect(screen.getByText('jane.smith@example.com')).toBeInTheDocument();
    expect(screen.getByText('$50,000')).toBeInTheDocument();
    expect(screen.getByText('$60,000')).toBeInTheDocument();
  });

  test('renders "No Employees" when employees list is empty', () => {
    render(
      <Table
        employees={[]}
        handleEdit={mockHandleEdit}
        handleDelete={mockHandleDelete}
      />
    );

    expect(screen.getByText('No Employees')).toBeInTheDocument();
  });

  test('calls handleEdit when Edit button is clicked', () => {
    render(
      <Table
        employees={mockEmployees}
        handleEdit={mockHandleEdit}
        handleDelete={mockHandleDelete}
      />
    );

    fireEvent.click(screen.getAllByText('Edit')[0]);

    expect(mockHandleEdit).toHaveBeenCalledWith(1);
  });

  test('calls handleDelete when Delete button is clicked', () => {
    render(
      <Table
        employees={mockEmployees}
        handleEdit={mockHandleEdit}
        handleDelete={mockHandleDelete}
      />
    );

    fireEvent.click(screen.getAllByText('Delete')[1]);

    expect(mockHandleDelete).toHaveBeenCalledWith(2);
  });
});