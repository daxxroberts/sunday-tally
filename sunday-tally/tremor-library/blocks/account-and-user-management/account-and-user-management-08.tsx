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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/Tabs';

const existingUsers = [
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

const pendingUsers = [
  //array-start
  {
    name: 'Mike Mueller',
    email: 'm.mueller@gmail.com',
    role: 'Admin',
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
      <div className="sm:mx-auto sm:max-w-2xl">
        <h1 className="text-lg font-bold text-gray-900 dark:text-gray-50">
          General
        </h1>
        <p className="mt-2 text-sm/6 text-gray-500 dark:text-gray-500">
          Manage your workspace, team members and notifications.
        </p>
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
          <Tabs defaultValue="tab1" className="mt-8">
            <TabsList variant="line">
              <TabsTrigger value="tab1">Existing users</TabsTrigger>
              <TabsTrigger value="tab2">Pending invitations</TabsTrigger>
            </TabsList>
            <TabsContent value="tab1">
              <div className="mt-4 sm:flex sm:items-center sm:space-x-2">
                <Input placeholder="Search users..." type="search" />
                <Select defaultValue="1">
                  <SelectTrigger className="mt-2 sm:mt-0 sm:w-32">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((item) => (
                      <SelectItem key={item.name} value={item.value}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TableRoot className="mt-3">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="text-xs uppercase text-gray-500 dark:text-gray-500">
                        Member
                      </TableHeaderCell>
                      <TableHeaderCell className="text-xs uppercase text-gray-500 dark:text-gray-500">
                        Email
                      </TableHeaderCell>
                      <TableHeaderCell className="text-xs uppercase text-gray-500 dark:text-gray-500">
                        Role
                      </TableHeaderCell>
                      <TableHeaderCell>
                        <span className="sr-only">Edit member</span>
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {existingUsers.map((member) => (
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
            </TabsContent>
            <TabsContent value="tab2">
              <div className="mt-4 sm:flex sm:items-center sm:space-x-2">
                <Input placeholder="Search users..." type="search" />
                <Select defaultValue="1">
                  <SelectTrigger className="mt-2 sm:mt-0 sm:w-32">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((item) => (
                      <SelectItem key={item.name} value={item.value}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <TableRoot className="mt-3">
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell className="text-xs uppercase text-gray-500 dark:text-gray-500">
                        Member
                      </TableHeaderCell>
                      <TableHeaderCell className="text-xs uppercase text-gray-500 dark:text-gray-500">
                        Email
                      </TableHeaderCell>
                      <TableHeaderCell className="text-xs uppercase text-gray-500 dark:text-gray-500">
                        Role
                      </TableHeaderCell>
                      <TableHeaderCell>
                        <span className="sr-only">Edit member</span>
                      </TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pendingUsers.map((member) => (
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
                            className="font-medium text-blue-600 hover:underline hover:underline-offset-4 dark:text-blue-400"
                          >
                            Edit<span className="sr-only">{member.name}</span>
                          </a>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableRoot>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
