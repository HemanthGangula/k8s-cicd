import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Add from './Add';
import Swal from 'sweetalert2';

jest.mock('sweetalert2', () => ({
  fire: jest.fn(),
}));

describe('Add Component', () => {
  const mockSetEmployees = jest.fn();
  const mockSetIsAdding = jest.fn();
  const mockEmployees = [];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders Add component correctly', () => {
    render(
      <Add
        employees={mockEmployees}
        setEmployees={mockSetEmployees}
        setIsAdding={mockSetIsAdding}
      />
    );

    expect(screen.getByText('Add Employee')).toBeInTheDocument();
    expect(screen.getByLabelText('First Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Last Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Salary ($)')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  test('shows error alert when fields are empty', () => {
    render(
      <Add
        employees={mockEmployees}
        setEmployees={mockSetEmployees}
        setIsAdding={mockSetIsAdding}
      />
    );

    fireEvent.click(screen.getByText('Add'));

    expect(Swal.fire).toHaveBeenCalledWith({
      icon: 'error',
      title: 'Error!',
      text: 'All fields are required.',
      showConfirmButton: true,
    });
  });

  test('adds a new employee when form is submitted', () => {
    render(
      <Add
        employees={mockEmployees}
        setEmployees={mockSetEmployees}
        setIsAdding={mockSetIsAdding}
      />
    );

    fireEvent.change(screen.getByLabelText('First Name'), {
      target: { value: 'John' },
    });
    fireEvent.change(screen.getByLabelText('Last Name'), {
      target: { value: 'Doe' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'john.doe@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Salary ($)'), {
      target: { value: '50000' },
    });
    fireEvent.change(screen.getByLabelText('Date'), {
      target: { value: '2025-04-17' },
    });

    fireEvent.click(screen.getByText('Add'));

    expect(mockSetEmployees).toHaveBeenCalledWith([
      {
        id: 1,
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@example.com',
        salary: '50000',
        date: '2025-04-17',
      },
    ]);
    expect(mockSetIsAdding).toHaveBeenCalledWith(false);
    expect(Swal.fire).toHaveBeenCalledWith({
      icon: 'success',
      title: 'Added!',
      text: "John Doe's data has been Added.",
      showConfirmButton: false,
      timer: 1500,
    });
  });

  test('calls setIsAdding(false) when cancel button is clicked', () => {
    render(
      <Add
        employees={mockEmployees}
        setEmployees={mockSetEmployees}
        setIsAdding={mockSetIsAdding}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));

    expect(mockSetIsAdding).toHaveBeenCalledWith(false);
  });
});