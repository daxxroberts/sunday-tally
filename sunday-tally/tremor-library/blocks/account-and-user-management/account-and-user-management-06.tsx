'use client';

import { Button } from '@/components/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRoot,
  TableRow,
} from '@/components/Table';
import { Tabs, TabsList, TabsTrigger } from '@/components/Tabs';

const data = [
  //array-start
  {
    name: 'Alissia Stone',
    email: 'a.stone@gmail.com',
    role: 'Admin',
    href: '#',
  },
  {
    name: 'Emma Bern',
    email: 'e.bern@gmail.com',
    role: 'Guest',
    href: '#',
  },
  {
    name: 'Aaron Wave',
    email: 'a.flow@acme.com',
    role: 'Guest',
    href: '#',
  },
  {
    name: 'Thomas Palstein',
    email: 't.palstein@acme.com',
    role: 'Member',
    href: '#',
  },
  {
    name: 'Sarah Johnson',
    email: 's.johnson@gmail.com',
    role: 'Admin',
    href: '#',
  },
  {
    name: 'Megan Brown',
    email: 'm.brown@gmail.com',
    role: 'Guest',
    href: '#',
  },
  //array-end
];

export default function Example() {
  return (
    <div className="obfuscate">
      <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">
        General
      </h1>
      <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
        Manage your personal details, workspace governance and notifications.
      </p>
      <Tabs defaultValue="tab2" className="mt-8">
        <TabsList variant="line">
          <TabsTrigger value="tab1">Account details</TabsTrigger>
          <TabsTrigger value="tab2">Users</TabsTrigger>
          <TabsTrigger value="tab3">Billing</TabsTrigger>
        </TabsList>
        {/* Content below only for demo purpose placed outside of <Tab> component. Add <TabPanels>, <TabPanel> to make it functional and to add content for other tabs */}
        <div className="mt-6 sm:flex sm:items-start sm:justify-between sm:space-x-8">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-50">
              Users
            </h2>
            <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
              Workspace administrators can add, manage, and remove members.
            </p>
          </div>
          <Button className="mt-4 sm:mt-0">Add user</Button>
        </div>
        <TableRoot className="mt-10">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Member</TableHeaderCell>
                <TableHeaderCell>Users</TableHeaderCell>
                <TableHeaderCell>Role</TableHeaderCell>
                <TableHeaderCell>
                  <span className="sr-only">Edit member</span>
                </TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.map((member) => (
                <TableRow
                  key={member.name}
                  className="hover:bg-gray-50 hover:dark:bg-gray-900"
                >
                  <TableCell className="font-medium text-gray-900 dark:text-gray-50">
                    {member.name}
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>{member.role}</TableCell>
                  <TableCell className="text-right">
                    <a
                      href={member.href}
                      className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-500 hover:dark:text-blue-400"
                    >
                      Edit<span className="sr-only">{member.name}</span>
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableRoot>
      </Tabs>
    </div>
  );
}
