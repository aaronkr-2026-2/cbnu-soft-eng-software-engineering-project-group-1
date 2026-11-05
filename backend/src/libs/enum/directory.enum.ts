import { registerEnumType } from '@nestjs/graphql';

export enum DirectorySort {
  NAME_ASC = 'NAME_ASC',
  NAME_DESC = 'NAME_DESC',
}
registerEnumType(DirectorySort, { name: 'DirectorySort' });
