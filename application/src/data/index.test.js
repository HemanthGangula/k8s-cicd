import { employeesData } from './index';

describe('employeesData', () => {
  test('should be an array', () => {
    expect(Array.isArray(employeesData)).toBe(true);
  });

  test('should contain 10 employees', () => {
    expect(employeesData.length).toBe(10);
  });

  test('each employee should have the correct structure', () => {
    employeesData.forEach((employee) => {
      expect(employee).toHaveProperty('id');
      expect(employee).toHaveProperty('firstName');
      expect(employee).toHaveProperty('lastName');
      expect(employee).toHaveProperty('email');
      expect(employee).toHaveProperty('salary');
      expect(employee).toHaveProperty('date');

      expect(typeof employee.id).toBe('number');
      expect(typeof employee.firstName).toBe('string');
      expect(typeof employee.lastName).toBe('string');
      expect(typeof employee.email).toBe('string');
      expect(typeof employee.salary).toBe('string');
      expect(typeof employee.date).toBe('string');
    });
  });

  test('should contain specific employee data', () => {
    const specificEmployee = employeesData.find(
      (employee) => employee.email === 'susan@example.com'
    );

    expect(specificEmployee).toBeDefined();
    expect(specificEmployee).toEqual({
      id: 1,
      firstName: 'Susan',
      lastName: 'Jordon',
      email: 'susan@example.com',
      salary: '95000',
      date: '2019-04-11',
    });
  });
});