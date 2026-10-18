import { registerEnumType } from '@nestjs/graphql';

export enum Location {
  SEOUL = 'SEOUL',
  INCHEON = 'INCHEON',
  BUSAN = 'BUSAN',
  JEJU = 'JEJU',
  DAEGU = 'DAEGU',
  DAEJEON = 'DAEJEON',
  GWANGJU = 'GWANGJU',
  ULSAN = 'ULSAN',
  SUWON = 'SUWON',
  SEJONG = 'SEJONG',
}

registerEnumType(Location, { name: 'Location' });
