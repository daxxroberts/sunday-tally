'use client';

import { RiExternalLinkLine } from '@remixicon/react';

import { Button } from '@/components/Button';
import { Divider } from '@/components/Divider';
import { Input } from '@/components/Input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/Select';
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

const roles = [
  //array-start
  {
    name: 'Guest',
    value: '1',
  },
  {
    name: 'Member',
    value: '2',
  },
  {
    name: 'Admin',
    value: '3',
  },
  //array-end
];

export default function Example() {
  return (
    <div className="obfuscate">
      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-50">
        General
      </h3>
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
        <h2 className="mt-8 font-semibold text-gray-900 dark:text-gray-50">
          Invite new users
        </h2>
        <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
          Workspace administrators can add, manage, and remove members.{' '}
          <a
            href="#"
            className="inline-flex items-center gap-1 text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
          >
            Learn more about roles
            <RiExternalLinkLine className="size-4" aria-hidden="true" />
          </a>
        </p>
        <div className="max-w-3xl">
          <form className="mt-6 sm:flex sm:items-center sm:space-x-2">
            <Select defaultValue="1">
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="mt-2 flex w-full items-center space-x-2 sm:mt-0">
              <Input placeholder="Add email..." type="email" />
              <Button className="text-base sm:text-sm">Invite</Button>
            </div>
          </form>
          <Divider className="!my-10" />
          <h2 className="mt-6 font-semibold text-gray-900 dark:text-gray-50">
            Existing users
          </h2>
          <div className="mt-4 sm:flex sm:items-center sm:space-x-2">
            <Input placeholder="Search users..." type="search" />
            <Select defaultValue="1">
              <SelectTrigger className="mt-2 sm:mt-0 sm:w-32">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TableRoot className="mt-6">
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell>Member</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
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
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell className="text-right">
                      <a
                        href={member.href}
                        className="font-medium text-blue-500 hover:underline hover:underline-offset-4 dark:text-blue-500"
                      >
                        Edit<span className="sr-only">{member.name}</span>
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableRoot>
        </div>
      </Tabs>
    </div>
  );
}
