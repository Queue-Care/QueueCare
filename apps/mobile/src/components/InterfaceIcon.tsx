import React from 'react';
import { StyleSheet, View } from 'react-native';

// Decorative native line art keeps icons offline and out of the accessibility tree.
export function InterfaceIcon({
  name,
  color,
}: {
  name: string;
  color: string;
}) {
  const line = { borderColor: color };
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.frame}
    >
      {name === 'Search' ? (
        <>
          <View style={[styles.searchCircle, line]} />
          <View style={[styles.searchHandle, { backgroundColor: color }]} />
        </>
      ) : name === 'Location' ? (
        <>
          <View style={[styles.location, line]} />
          <View style={[styles.locationDot, line]} />
        </>
      ) : name === 'Clock' ? (
        <>
          <View style={[styles.clock, line]} />
          <View style={[styles.clockHour, { backgroundColor: color }]} />
          <View style={[styles.clockMinute, { backgroundColor: color }]} />
        </>
      ) : name === 'Home' || name === 'Dashboard' ? (
        <>
          <View style={[styles.roof, line]} />
          <View style={[styles.house, line]} />
          <View style={[styles.door, line]} />
        </>
      ) : name === 'Alerts' ? (
        <>
          <View style={[styles.bell, line]} />
          <View style={[styles.bellBase, { backgroundColor: color }]} />
          <View style={[styles.bellDot, { backgroundColor: color }]} />
        </>
      ) : name === 'Profile' ? (
        <>
          <View style={[styles.head, line]} />
          <View style={[styles.shoulders, line]} />
        </>
      ) : name === 'Priority' ? (
        <>
          <View style={[styles.pole, { backgroundColor: color }]} />
          <View style={[styles.flag, line]} />
        </>
      ) : (
        <>
          <View style={[styles.calendar, line]} />
          <View style={[styles.calendarRule, { backgroundColor: color }]} />
          <View style={[styles.leftRing, { backgroundColor: color }]} />
          <View style={[styles.rightRing, { backgroundColor: color }]} />
          <View style={[styles.date, { backgroundColor: color }]} />
        </>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  frame: { width: 24, height: 24 },
  searchCircle: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 1.7,
  },
  searchHandle: {
    position: 'absolute',
    left: 17,
    top: 15,
    width: 1.7,
    height: 8,
    borderRadius: 1,
    transform: [{ rotate: '-45deg' }],
  },
  location: {
    position: 'absolute',
    left: 6,
    top: 4,
    width: 12,
    height: 15,
    borderWidth: 1.4,
    borderRadius: 8,
    borderBottomRightRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  locationDot: {
    position: 'absolute',
    left: 10,
    top: 8,
    width: 4,
    height: 4,
    borderWidth: 1.4,
    borderRadius: 3,
  },
  clock: {
    position: 'absolute',
    left: 2,
    top: 2,
    width: 20,
    height: 20,
    borderWidth: 1.4,
    borderRadius: 10,
  },
  clockHour: { position: 'absolute', left: 11, top: 6, width: 1.4, height: 7 },
  clockMinute: {
    position: 'absolute',
    left: 14,
    top: 10,
    width: 1.4,
    height: 6,
    transform: [{ rotate: '-55deg' }],
  },
  roof: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderLeftWidth: 1.6,
    borderTopWidth: 1.6,
    transform: [{ rotate: '45deg' }],
    left: 5.5,
    top: 3,
  },
  house: {
    position: 'absolute',
    left: 4,
    top: 10,
    width: 16,
    height: 11,
    borderLeftWidth: 1.6,
    borderRightWidth: 1.6,
    borderBottomWidth: 1.6,
  },
  door: {
    position: 'absolute',
    left: 9,
    top: 14,
    width: 6,
    height: 7,
    borderWidth: 1.6,
    borderBottomWidth: 0,
  },
  calendar: {
    position: 'absolute',
    left: 3,
    top: 5,
    width: 18,
    height: 16,
    borderWidth: 1.6,
  },
  calendarRule: {
    position: 'absolute',
    left: 4,
    top: 10,
    width: 16,
    height: 1.6,
  },
  leftRing: { position: 'absolute', left: 7, top: 2, height: 6, width: 1.6 },
  rightRing: { position: 'absolute', right: 7, top: 2, height: 6, width: 1.6 },
  date: { position: 'absolute', left: 8, top: 14, width: 4, height: 4 },
  bell: {
    position: 'absolute',
    left: 5,
    top: 3,
    width: 14,
    height: 15,
    borderWidth: 1.6,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  bellBase: { position: 'absolute', left: 3, top: 17, width: 18, height: 1.6 },
  bellDot: { position: 'absolute', left: 10, top: 21, width: 4, height: 1.6 },
  head: {
    position: 'absolute',
    left: 8,
    top: 2,
    width: 8,
    height: 8,
    borderWidth: 1.6,
    borderRadius: 4,
  },
  shoulders: {
    position: 'absolute',
    left: 4,
    top: 13,
    width: 16,
    height: 9,
    borderWidth: 1.6,
    borderBottomWidth: 0,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
  },
  pole: { position: 'absolute', left: 5, top: 3, height: 19, width: 1.6 },
  flag: {
    position: 'absolute',
    left: 6,
    top: 4,
    width: 13,
    height: 8,
    borderWidth: 1.6,
  },
});
