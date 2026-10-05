type SpecialCssHandlers = {
    [key: string]: (value: any) => string; // Adjust the value type as needed
  };
export const specialCssHandlers:SpecialCssHandlers = {
    "border": function (propertyObject: any) {
        let opStyle = ``;
        const fourBorderArray = ['left', 'top', 'right', 'bottom']
        for (const key in propertyObject) {
            if (Object.prototype.hasOwnProperty.call(propertyObject, key)) {
                const element = propertyObject[key];
                if (fourBorderArray.includes(key)) {
                    opStyle += `border-${key} : ${element.width.value}${element.width.unit} ${element.style} ${element.color};`
                }
            }
        }
        return opStyle;
    },
    "border-radius": function (propertyObject: any) {
        let opStyle = ``;
        console.log("updating radius: ", propertyObject)
        for (const key in propertyObject) {
            if (Object.prototype.hasOwnProperty.call(propertyObject, key)) {
                const element = propertyObject[key];
                if(key == "all"){
                    opStyle += `border-radius: ${element.value}${element.unit};`
                }
                // if(key == "custom"){
                //     opStyle += `border-radius: ${element.value}`
                // }
            }
        }
        
        // const fourBorderArray = ['left', 'top', 'right', 'bottom']
        // for (const key in propertyObject) {
        //     if (Object.prototype.hasOwnProperty.call(propertyObject, key)) {
        //         const element = propertyObject[key];
        //         if (fourBorderArray.includes(key)) {
        //             opStyle += `border-${key} : ${element.width.value}${element.width.unit} ${element.style} ${element.color};`
        //         }
        //     }
        // }
        return opStyle;
    }
}